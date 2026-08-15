import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import {
  assertBalancedJournalLines,
  assertValidTransactionRate,
  decreaseInventoryBalance,
  getOrCreatePartnerLedgerAccount,
  increaseInventoryBalance,
  resolveAccountByType,
  resolvePaymentAccount,
  resolveBaseCurrencyAccount,
  resolveRateToBase,
  updateAccountBalance,
} from "../../utils/accounting.js";
import { AppError } from "../../utils/app-error.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreatePurchaseInput,
  ListPurchasesQuery,
  PurchasePaymentInput,
  PurchaseReturnInput,
  UpdatePurchaseInput,
} from "./purchases.validation.js";

const purchaseInclude = {
  vendor: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      phone: true,
      address: true,
    },
  },

  vendorLedgerAccount: {
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  },
  inventoryAccount: {
    select: { id: true, code: true, name: true, type: true },
  },
  expenseAccount: { select: { id: true, code: true, name: true, type: true } },
  currency: true,
  journalEntry: {
    include: {
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true } },
          partner: { select: { id: true, code: true, name: true } },
        },
        orderBy: { lineNo: "asc" },
      },
    },
  },
  inventoryMovement: {
    include: {
      lines: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              baseUnit: { select: { id: true, code: true, name: true } },
            },
          },
          toLocation: { select: { id: true, code: true, name: true } },
        },
        orderBy: { lineNo: "asc" },
      },
    },
  },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          baseUnit: { select: { id: true, code: true, name: true } },
        },
      },
      location: { select: { id: true, code: true, name: true } },
    },
    orderBy: { lineNo: "asc" },
  },
  payments: true,
  createdBy: {
    select: { id: true, code: true, fullName: true, username: true },
  },
} satisfies Prisma.PurchaseBillInclude;

function startOfDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function nextDay(date: Date) {
  const value = startOfDay(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function lineTotal(line: CreatePurchaseInput["lines"][number]) {
  return roundMoney(line.quantity * line.unitCost - line.discount);
}

async function updateWeightedAverageCosts(
  tx: Prisma.TransactionClient,
  products: Array<{ id: string; standardCost: Prisma.Decimal }>,
  lines: CreatePurchaseInput["lines"],
  conversionFactor: number,
) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const additions = new Map<string, { quantity: number; value: number }>();
  for (const line of lines) {
    const current = additions.get(line.productId) ?? { quantity: 0, value: 0 };
    current.quantity += line.quantity;
    current.value += lineTotal(line) * conversionFactor;
    additions.set(line.productId, current);
  }
  for (const [productId, addition] of additions) {
    const stock = await tx.inventoryBalance.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const existingQuantity = Number(stock._sum.quantity ?? 0);
    const existingCost = Number(productById.get(productId)?.standardCost ?? 0);
    const totalQuantity = existingQuantity + addition.quantity;
    if (totalQuantity <= 0) continue;
    const standardCost = roundMoney(
      (existingQuantity * existingCost + addition.value) / totalQuantity,
    );
    await tx.product.update({ where: { id: productId }, data: { standardCost } });
  }
}

async function resolvePurchaseInventoryRate(
  tx: Prisma.TransactionClient,
  inventoryCurrency: CreatePurchaseInput["currencyCode"],
  input: CreatePurchaseInput,
) {
  if (inventoryCurrency === input.currencyCode) return input.exchangeRateToBase;
  if (input.productExchangeRate && input.productExchangeRate > 0) {
    return input.exchangeRateToBase * input.productExchangeRate;
  }
  try {
    return await resolveRateToBase(tx, inventoryCurrency, input.billDate);
  } catch (error) {
    if (input.productExchangeRate && input.productExchangeRate > 0) {
      return input.exchangeRateToBase * input.productExchangeRate;
    }
    throw error;
  }
}

async function getVendorLedger(
  tx: Prisma.TransactionClient,
  vendorId: string,
  currencyCode: CreatePurchaseInput["currencyCode"],
) {
  const { partner, ledger } = await getOrCreatePartnerLedgerAccount(
    tx,
    vendorId,
    currencyCode,
    "payable",
  );
  return { vendor: partner, ledger };
}

export async function listPurchases(query: ListPurchasesQuery) {
  const pagination = getPagination(query);
  const where: Prisma.PurchaseBillWhereInput = {
    status: query.status,
    vendorId: query.vendorId,
    billDate: {
      gte: query.from ? startOfDay(query.from) : undefined,
      lt: query.to ? nextDay(query.to) : undefined,
    },
  };
  const [purchases, total] = await Promise.all([
    prisma.purchaseBill.findMany({
      where,
      orderBy: { billDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: purchaseInclude,
    }),
    prisma.purchaseBill.count({ where }),
  ]);

  return paginatedResponse(purchases, total, pagination.page, pagination.limit);
}

export async function getPurchase(id: string) {
  const purchase = await prisma.purchaseBill.findUnique({
    where: { id },
    include: purchaseInclude,
  });

  if (!purchase) {
    throw new AppError(404, "Purchase bill not found");
  }

  return { purchase };
}

export async function getPurchaseByNumber(number: string) {
  const purchase = await prisma.purchaseBill.findUnique({
    where: { number },
    include: purchaseInclude,
  });

  if (!purchase) {
    throw new AppError(404, "Purchase bill not found");
  }

  return { purchase };
}

export async function createPurchase(
  input: CreatePurchaseInput,
  createdById?: string,
) {
  const subtotal = input.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (subtotal < 0) {
    throw new AppError(400, "Purchase subtotal cannot be negative");
  }

  const total = roundMoney(subtotal + input.taxTotal);
  if (roundMoney(input.paidAmount) > total) {
    throw new AppError(
      400,
      "Paid amount cannot be greater than purchase total",
    );
  }

  const purchase = await withTransaction(async (tx) => {
    await assertValidTransactionRate(tx, input.currencyCode, input.exchangeRateToBase);
    const { vendor, ledger } = await getVendorLedger(
      tx,
      input.vendorId,
      input.currencyCode,
    );
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, preferredPurchaseCurrency: true, standardCost: true },
    });
    if (products.length !== productIds.length) {
      throw new AppError(400, "Every purchase line needs an active product");
    }
    const inventoryCurrencies = [
      ...new Set(products.map((product) => product.preferredPurchaseCurrency)),
    ];
    if (inventoryCurrencies.length !== 1) {
      throw new AppError(
        400,
        "Products with different inventory currencies must be purchased on separate bills",
      );
    }
    const inventoryCurrency = inventoryCurrencies[0];
    const inventoryAccount = await resolveAccountByType(
      tx,
      undefined,
      "inventory",
      inventoryCurrency,
    );
    const inventoryRateToBase = await resolvePurchaseInventoryRate(
      tx,
      inventoryCurrency,
      input,
    );
    const paymentAccount =
      input.paidAmount > 0
        ? await resolvePaymentAccount(
            tx,
            input.paymentAccountId,
            input.currencyCode,
            input.paidAmount,
          )
        : null;

    const purchaseNumber = await nextEntityCode(tx, "purchase");
    const journalNumber = await nextEntityCode(tx, "journal");
    const movementNumber = await nextEntityCode(tx, "inventoryMovement");
    const baseTotal = total * input.exchangeRateToBase;
    const inventoryValue = baseTotal / inventoryRateToBase;
    const inventoryConversionFactor =
      input.exchangeRateToBase / inventoryRateToBase;
    const paidBase = input.paidAmount * input.exchangeRateToBase;
    const status =
      input.paidAmount >= total && total > 0
        ? "paid"
        : input.paidAmount > 0
          ? "partially_paid"
          : "posted";

    const movement = await tx.inventoryMovement.create({
      data: {
        number: movementNumber,
        type: "purchase_receipt",
        status: "posted",
        movedAt: input.billDate,
        valueCurrencyCode: inventoryCurrency,
        totalValue: inventoryValue,
        createdById,
        notes: input.notes,
        lines: {
          create: input.lines.map((line, index) => ({
            lineNo: index + 1,
            productId: line.productId,
            toLocationId: line.locationId,
            quantity: line.quantity,
            unitCost: line.unitCost * inventoryConversionFactor,
            lineValue: lineTotal(line) * inventoryConversionFactor,
          })),
        },
      },
    });

    const journalLines = [
      {
        lineNo: 1,
        accountId: inventoryAccount.id,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: inventoryValue,
        credit: 0,
        baseDebit: baseTotal,
        baseCredit: 0,
        memo: "Inventory purchased",
      },
      {
        lineNo: 2,
        accountId: ledger.accountId,
        partnerId: vendor.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: 0,
        credit: total,
        baseDebit: 0,
        baseCredit: baseTotal,
        memo: "Vendor payable",
      },
    ];

    if (input.paidAmount > 0 && paymentAccount) {
      journalLines.push(
        {
          lineNo: 3,
          accountId: ledger.accountId,
          partnerId: vendor.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: input.paidAmount,
          credit: 0,
          baseDebit: paidBase,
          baseCredit: 0,
          memo: "Vendor payment applied",
        },
        {
          lineNo: 4,
          accountId: paymentAccount.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: 0,
          credit: input.paidAmount,
          baseDebit: 0,
          baseCredit: paidBase,
          memo: "Money paid to vendor",
        },
      );
    }

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.billDate,
        description: input.notes ?? `Purchase bill ${purchaseNumber}`,
        status: "posted",
        sourceType: "purchase",
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });

    const bill = await tx.purchaseBill.create({
      data: {
        number: purchaseNumber,
        vendorId: input.vendorId,
        vendorLedgerAccountId: ledger.id,
        inventoryAccountId: inventoryAccount.id,
        expenseAccountId: input.expenseAccountId,
        billDate: input.billDate,
        dueDate: input.dueDate,
        status,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        subtotal,
        discountTotal: input.lines.reduce(
          (sum, line) => sum + line.discount,
          0,
        ),
        taxTotal: input.taxTotal,
        total,
        paidTotal: input.paidAmount,
        journalEntryId: journalEntry.id,
        inventoryMovementId: movement.id,
        createdById,
        lines: {
          create: input.lines.map((line, index) => ({
            lineNo: index + 1,
            productId: line.productId,
            locationId: line.locationId,
            description: line.description,
            quantity: line.quantity,
            unitCost: line.unitCost,
            discount: line.discount,
            lineTotal: lineTotal(line),
          })),
        },
      },
    });

    await tx.journalEntry.update({
      where: { id: journalEntry.id },
      data: { sourceId: bill.id },
    });
    await tx.inventoryMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: journalEntry.id },
    });

    if (input.paidAmount > 0 && paymentAccount) {
      const paymentNumber = await nextEntityCode(tx, "payment");
      await tx.payment.create({
        data: {
          number: paymentNumber,
          direction: "pay",
          partnerId: vendor.id,
          purchaseBillId: bill.id,
          fromAccountId: paymentAccount.id,
          toAccountId: ledger.accountId,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          amount: input.paidAmount,
          paymentDate: input.billDate,
          journalEntryId: journalEntry.id,
          createdById,
          notes: input.notes,
        },
      });
    }

    await updateWeightedAverageCosts(tx, products, input.lines, inventoryConversionFactor);
    for (const line of input.lines) {
      await increaseInventoryBalance(
        tx,
        line.productId,
        line.locationId,
        line.quantity,
      );
    }
    await updateAccountBalance(
      tx,
      inventoryAccount.id,
      inventoryCurrency,
      inventoryValue,
      0,
    );
    await updateAccountBalance(
      tx,
      ledger.accountId,
      input.currencyCode,
      0,
      total,
    );
    if (input.paidAmount > 0 && paymentAccount) {
      await updateAccountBalance(
        tx,
        ledger.accountId,
        input.currencyCode,
        input.paidAmount,
        0,
      );
      await updateAccountBalance(
        tx,
        paymentAccount.id,
        input.currencyCode,
        0,
        input.paidAmount,
      );
    }

    return tx.purchaseBill.findUniqueOrThrow({
      where: { id: bill.id },
      include: purchaseInclude,
    });
  });

  return { purchase };
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function documentStatusFromPaid(total: number, paidTotal: number) {
  if (paidTotal >= total && total > 0) return "paid" as const;
  if (paidTotal > 0) return "partially_paid" as const;
  return "posted" as const;
}

async function reversePostedPurchaseJournal(
  tx: Prisma.TransactionClient,
  purchase: {
    id: string;
    number: string;
    currencyCode: CreatePurchaseInput["currencyCode"];
    journalEntryId: string | null;
    lines: Array<{
      productId: string;
      locationId: string | null;
      quantity: Prisma.Decimal | number;
    }>;
  },
  createdById?: string,
  memoPrefix = "Reversal",
) {
  if (!purchase.journalEntryId) {
    throw new AppError(400, "Purchase bill has no journal entry to reverse");
  }

  const originalJournal = await tx.journalEntry.findUnique({
    where: { id: purchase.journalEntryId },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });

  if (!originalJournal || originalJournal.status !== "posted") {
    throw new AppError(400, "Original purchase journal cannot be reversed");
  }

  for (const line of purchase.lines) {
    if (!line.locationId) {
      throw new AppError(
        400,
        "Every purchase line needs a location to reverse inventory",
      );
    }
    await decreaseInventoryBalance(
      tx,
      line.productId,
      line.locationId,
      Number(line.quantity),
    );
  }

  const movementNumber = await nextEntityCode(tx, "inventoryMovement");
  const returnMovement = await tx.inventoryMovement.create({
    data: {
      number: movementNumber,
      type: "return_out",
      status: "posted",
      movedAt: new Date(),
      valueCurrencyCode: purchase.currencyCode,
      totalValue: 0,
      createdById,
      notes: `${memoPrefix} of ${purchase.number}`,
      lines: {
        create: purchase.lines.map((line, index) => ({
          lineNo: index + 1,
          productId: line.productId,
          fromLocationId: line.locationId!,
          quantity: Number(line.quantity),
          unitCost: 0,
          lineValue: 0,
        })),
      },
    },
  });

  const journalNumber = await nextEntityCode(tx, "journal");
  const reversingLines = originalJournal.lines.map((line, index) => ({
    lineNo: index + 1,
    accountId: line.accountId,
    partnerId: line.partnerId,
    currencyCode: line.currencyCode,
    exchangeRateToBase: Number(line.exchangeRateToBase),
    debit: Number(line.credit),
    credit: Number(line.debit),
    baseDebit: Number(line.baseCredit),
    baseCredit: Number(line.baseDebit),
    memo: `${memoPrefix}: ${line.memo ?? purchase.number}`,
  }));

  assertBalancedJournalLines(reversingLines);

  const reversalJournal = await tx.journalEntry.create({
    data: {
      number: journalNumber,
      entryDate: new Date(),
      description: `${memoPrefix} of purchase bill ${purchase.number}`,
      status: "posted",
      sourceType: "purchase",
      sourceId: purchase.id,
      reversalOfId: originalJournal.id,
      createdById,
      postedById: createdById,
      postedAt: new Date(),
      lines: { create: reversingLines },
    },
  });

  await tx.journalEntry.update({
    where: { id: originalJournal.id },
    data: { status: "reversed" },
  });

  await tx.inventoryMovement.update({
    where: { id: returnMovement.id },
    data: { journalEntryId: reversalJournal.id },
  });

  for (const line of originalJournal.lines) {
    await updateAccountBalance(
      tx,
      line.accountId,
      line.currencyCode,
      Number(line.credit),
      Number(line.debit),
    );
  }

  return { reversalJournal, returnMovement };
}

export async function payPurchaseBill(
  purchaseId: string,
  input: PurchasePaymentInput,
  createdById?: string,
) {
  const purchase = await withTransaction(async (tx) => {
    const existing = await tx.purchaseBill.findUnique({
      where: { id: purchaseId },
      include: { vendorLedgerAccount: true },
    });

    if (!existing) {
      throw new AppError(404, "Purchase bill not found");
    }
    if (existing.status === "cancelled") {
      throw new AppError(400, "Cannot pay a cancelled purchase bill");
    }

    const total = Number(existing.total);
    const paidTotal = Number(existing.paidTotal);
    const remaining = roundMoney(total - paidTotal);
    if (remaining <= 0) {
      throw new AppError(400, "Purchase bill is already fully paid");
    }
    if (input.amount > remaining) {
      throw new AppError(400, "Payment amount cannot exceed remaining balance");
    }

    const paymentDate = input.paymentDate ?? new Date();
    const exchangeRateToBase = Number(existing.exchangeRateToBase);
    await assertValidTransactionRate(tx, existing.currencyCode, exchangeRateToBase);
    const paymentAccount = await resolvePaymentAccount(
      tx,
      input.paymentAccountId,
      existing.currencyCode,
      input.amount,
    );
    const amountBase = input.amount * exchangeRateToBase;
    const payableBase = input.amount * Number(existing.exchangeRateToBase);
    const exchangeDifference = Math.round((amountBase - payableBase) * 100) / 100;
    const journalNumber = await nextEntityCode(tx, "journal");
    const paymentNumber = await nextEntityCode(tx, "payment");

    const journalLines = [
      {
        lineNo: 1,
        accountId: existing.vendorLedgerAccount.accountId,
        partnerId: existing.vendorId,
        currencyCode: existing.currencyCode,
        exchangeRateToBase: Number(existing.exchangeRateToBase),
        debit: input.amount,
        credit: 0,
        baseDebit: payableBase,
        baseCredit: 0,
        memo: "Vendor payment applied",
      },
      {
        lineNo: 2,
        accountId: paymentAccount.id,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        debit: 0,
        credit: input.amount,
        baseDebit: 0,
        baseCredit: amountBase,
        memo: "Money paid to vendor",
      },
    ];

    let exchangeAccount: Awaited<ReturnType<typeof resolveBaseCurrencyAccount>> | null = null;
    if (Math.abs(exchangeDifference) >= 0.01) {
      exchangeAccount = await resolveBaseCurrencyAccount(
        tx,
        exchangeDifference > 0 ? "exchange_loss" : "exchange_gain",
      );
      journalLines.push({
        lineNo: 3,
        accountId: exchangeAccount.account.id,
        currencyCode: exchangeAccount.currencyCode,
        exchangeRateToBase: 1,
        debit: exchangeDifference > 0 ? exchangeDifference : 0,
        credit: exchangeDifference < 0 ? Math.abs(exchangeDifference) : 0,
        baseDebit: exchangeDifference > 0 ? exchangeDifference : 0,
        baseCredit: exchangeDifference < 0 ? Math.abs(exchangeDifference) : 0,
        memo: exchangeDifference > 0 ? "Realized exchange loss" : "Realized exchange gain",
      });
    }

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: paymentDate,
        description: input.notes ?? `Payment for ${existing.number}`,
        status: "posted",
        sourceType: "payment",
        sourceId: existing.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });

    const nextPaidTotal = roundMoney(paidTotal + input.amount);
    const nextStatus = documentStatusFromPaid(total, nextPaidTotal);

    await tx.payment.create({
      data: {
        number: paymentNumber,
        direction: "pay",
        partnerId: existing.vendorId,
        purchaseBillId: existing.id,
        fromAccountId: paymentAccount.id,
        toAccountId: existing.vendorLedgerAccount.accountId,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        amount: input.amount,
        paymentDate,
        journalEntryId: journalEntry.id,
        createdById,
        notes: input.notes,
      },
    });

    await updateAccountBalance(
      tx,
      existing.vendorLedgerAccount.accountId,
      existing.currencyCode,
      input.amount,
      0,
    );
    await updateAccountBalance(
      tx,
      paymentAccount.id,
      existing.currencyCode,
      0,
      input.amount,
    );
    if (exchangeAccount) {
      await updateAccountBalance(
        tx,
        exchangeAccount.account.id,
        exchangeAccount.currencyCode,
        exchangeDifference > 0 ? exchangeDifference : 0,
        exchangeDifference < 0 ? Math.abs(exchangeDifference) : 0,
      );
    }

    return tx.purchaseBill.update({
      where: { id: existing.id },
      data: { paidTotal: nextPaidTotal, status: nextStatus },
      include: purchaseInclude,
    });
  });

  return { purchase };
}

export async function cancelPurchase(purchaseId: string, createdById?: string) {
  const purchase = await withTransaction(async (tx) => {
    const existing = await tx.purchaseBill.findUnique({
      where: { id: purchaseId },
      include: { lines: true },
    });

    if (!existing) {
      throw new AppError(404, "Purchase bill not found");
    }
    if (existing.status === "cancelled") {
      throw new AppError(400, "Purchase bill is already cancelled");
    }
    if (existing.status !== "posted" || Number(existing.paidTotal) !== 0) {
      throw new AppError(
        400,
        "Only unpaid posted purchase bills can be cancelled. Pay remaining balance or keep the bill and create a replacement.",
      );
    }

    await reversePostedPurchaseJournal(
      tx,
      existing,
      createdById,
      "Cancellation",
    );

    return tx.purchaseBill.update({
      where: { id: existing.id },
      data: { status: "cancelled" },
      include: purchaseInclude,
    });
  });

  return { purchase };
}

export async function updatePurchase(
  purchaseId: string,
  input: UpdatePurchaseInput,
  createdById?: string,
) {
  const subtotal = input.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (subtotal < 0) {
    throw new AppError(400, "Purchase subtotal cannot be negative");
  }
  const total = roundMoney(subtotal + input.taxTotal);
  if (roundMoney(input.paidAmount) > total) {
    throw new AppError(
      400,
      "Paid amount cannot be greater than purchase total",
    );
  }

  const purchase = await withTransaction(async (tx) => {
    await assertValidTransactionRate(tx, input.currencyCode, input.exchangeRateToBase);
    const existing = await tx.purchaseBill.findUnique({
      where: { id: purchaseId },
      include: { lines: true },
    });

    if (!existing) {
      throw new AppError(404, "Purchase bill not found");
    }
    if (existing.status !== "posted" || Number(existing.paidTotal) !== 0) {
      throw new AppError(
        400,
        "Only unpaid posted purchase bills can be edited. Cancel and recreate if payments already exist.",
      );
    }
    if (input.currencyCode !== existing.currencyCode) {
      throw new AppError(
        400,
        "Cannot change currency on an existing purchase bill",
      );
    }

    await reversePostedPurchaseJournal(
      tx,
      existing,
      createdById,
      "Edit reversal",
    );

    const { vendor, ledger } = await getVendorLedger(
      tx,
      input.vendorId,
      input.currencyCode,
    );
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, preferredPurchaseCurrency: true, standardCost: true },
    });
    if (products.length !== productIds.length) {
      throw new AppError(400, "Every purchase line needs an active product");
    }
    const inventoryCurrencies = [
      ...new Set(products.map((product) => product.preferredPurchaseCurrency)),
    ];
    if (inventoryCurrencies.length !== 1) {
      throw new AppError(
        400,
        "Products with different inventory currencies must be purchased on separate bills",
      );
    }
    const inventoryCurrency = inventoryCurrencies[0];
    const inventoryAccount = await resolveAccountByType(
      tx,
      undefined,
      "inventory",
      inventoryCurrency,
    );
    const inventoryRateToBase = await resolvePurchaseInventoryRate(
      tx,
      inventoryCurrency,
      input,
    );
    const paymentAccount =
      input.paidAmount > 0
        ? await resolvePaymentAccount(
            tx,
            input.paymentAccountId,
            input.currencyCode,
            input.paidAmount,
          )
        : null;

    const purchaseNumber = existing.number;
    const journalNumber = await nextEntityCode(tx, "journal");
    const movementNumber = await nextEntityCode(tx, "inventoryMovement");
    const baseTotal = total * input.exchangeRateToBase;
    const inventoryValue = baseTotal / inventoryRateToBase;
    const inventoryConversionFactor =
      input.exchangeRateToBase / inventoryRateToBase;
    const paidBase = input.paidAmount * input.exchangeRateToBase;
    const status = documentStatusFromPaid(total, input.paidAmount);

    const movement = await tx.inventoryMovement.create({
      data: {
        number: movementNumber,
        type: "purchase_receipt",
        status: "posted",
        movedAt: input.billDate,
        valueCurrencyCode: inventoryCurrency,
        totalValue: inventoryValue,
        createdById,
        notes: input.notes,
        lines: {
          create: input.lines.map((line, index) => ({
            lineNo: index + 1,
            productId: line.productId,
            toLocationId: line.locationId,
            quantity: line.quantity,
            unitCost: line.unitCost * inventoryConversionFactor,
            lineValue: lineTotal(line) * inventoryConversionFactor,
          })),
        },
      },
    });

    const journalLines = [
      {
        lineNo: 1,
        accountId: inventoryAccount.id,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: inventoryValue,
        credit: 0,
        baseDebit: baseTotal,
        baseCredit: 0,
        memo: "Inventory purchased",
      },
      {
        lineNo: 2,
        accountId: ledger.accountId,
        partnerId: vendor.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: 0,
        credit: total,
        baseDebit: 0,
        baseCredit: baseTotal,
        memo: "Vendor payable",
      },
    ];

    if (input.paidAmount > 0 && paymentAccount) {
      journalLines.push(
        {
          lineNo: 3,
          accountId: ledger.accountId,
          partnerId: vendor.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: input.paidAmount,
          credit: 0,
          baseDebit: paidBase,
          baseCredit: 0,
          memo: "Vendor payment applied",
        },
        {
          lineNo: 4,
          accountId: paymentAccount.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: 0,
          credit: input.paidAmount,
          baseDebit: 0,
          baseCredit: paidBase,
          memo: "Money paid to vendor",
        },
      );
    }

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.billDate,
        description: input.notes ?? `Purchase bill ${purchaseNumber}`,
        status: "posted",
        sourceType: "purchase",
        sourceId: existing.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });

    await tx.purchaseBillLine.deleteMany({
      where: { purchaseBillId: existing.id },
    });

    await tx.purchaseBill.update({
      where: { id: existing.id },
      data: {
        vendorId: input.vendorId,
        vendorLedgerAccountId: ledger.id,
        inventoryAccountId: inventoryAccount.id,
        expenseAccountId: input.expenseAccountId,
        billDate: input.billDate,
        dueDate: input.dueDate,
        status,
        exchangeRateToBase: input.exchangeRateToBase,
        subtotal,
        discountTotal: input.lines.reduce(
          (sum, line) => sum + line.discount,
          0,
        ),
        taxTotal: input.taxTotal,
        total,
        paidTotal: input.paidAmount,
        journalEntryId: journalEntry.id,
        inventoryMovementId: movement.id,
        lines: {
          create: input.lines.map((line, index) => ({
            lineNo: index + 1,
            productId: line.productId,
            locationId: line.locationId,
            description: line.description,
            quantity: line.quantity,
            unitCost: line.unitCost,
            discount: line.discount,
            lineTotal: lineTotal(line),
          })),
        },
      },
    });

    await tx.inventoryMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: journalEntry.id },
    });

    if (input.paidAmount > 0 && paymentAccount) {
      const paymentNumber = await nextEntityCode(tx, "payment");
      await tx.payment.create({
        data: {
          number: paymentNumber,
          direction: "pay",
          partnerId: vendor.id,
          purchaseBillId: existing.id,
          fromAccountId: paymentAccount.id,
          toAccountId: ledger.accountId,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          amount: input.paidAmount,
          paymentDate: input.billDate,
          journalEntryId: journalEntry.id,
          createdById,
          notes: input.notes,
        },
      });
    }

    await updateWeightedAverageCosts(tx, products, input.lines, inventoryConversionFactor);
    for (const line of input.lines) {
      await increaseInventoryBalance(
        tx,
        line.productId,
        line.locationId,
        line.quantity,
      );
    }
    await updateAccountBalance(
      tx,
      inventoryAccount.id,
      inventoryCurrency,
      inventoryValue,
      0,
    );
    await updateAccountBalance(
      tx,
      ledger.accountId,
      input.currencyCode,
      0,
      total,
    );
    if (input.paidAmount > 0 && paymentAccount) {
      await updateAccountBalance(
        tx,
        ledger.accountId,
        input.currencyCode,
        input.paidAmount,
        0,
      );
      await updateAccountBalance(
        tx,
        paymentAccount.id,
        input.currencyCode,
        0,
        input.paidAmount,
      );
    }

    return tx.purchaseBill.findUniqueOrThrow({
      where: { id: existing.id },
      include: purchaseInclude,
    });
  });

  return { purchase };
}

export async function returnPurchaseProducts(
  purchaseId: string,
  input: PurchaseReturnInput,
  createdById?: string,
) {
  const purchase = await withTransaction(async (tx) => {
    const existing = await tx.purchaseBill.findUnique({
      where: { id: purchaseId },
      include: {
        lines: true,
        vendorLedgerAccount: true,
        inventoryAccount: true,
      },
    });

    if (!existing) {
      throw new AppError(404, "Purchase bill not found");
    }
    if (existing.status === "cancelled") {
      throw new AppError(
        400,
        "Cannot return products on a cancelled purchase bill",
      );
    }

    const { ledger: returnLedger } = await getVendorLedger(
      tx,
      existing.vendorId,
      existing.currencyCode,
    );
    if (existing.vendorLedgerAccountId !== returnLedger.id) {
      await tx.purchaseBill.update({
        where: { id: existing.id },
        data: { vendorLedgerAccountId: returnLedger.id },
      });
    }

    const lineById = new Map(existing.lines.map((line) => [line.id, line]));
    let returnValue = 0;
    let returnDiscount = 0;
    const returnLines: Array<{
      line: (typeof existing.lines)[number];
      quantity: number;
      value: number;
      discount: number;
    }> = [];

    for (const item of input.lines) {
      const line = lineById.get(item.lineId);
      if (!line) {
        throw new AppError(
          400,
          "Return line does not belong to this purchase bill",
        );
      }
      if (!line.locationId) {
        throw new AppError(400, "Purchase line is missing inventory location");
      }
      const currentQty = Number(line.quantity);
      if (item.quantity > currentQty) {
        throw new AppError(
          400,
          "Return quantity cannot exceed purchased quantity",
        );
      }
      const ratio = item.quantity / currentQty;
      const value = roundMoney(Number(line.lineTotal) * ratio);
      const discount = roundMoney(Number(line.discount) * ratio);
      returnValue = roundMoney(returnValue + value);
      returnDiscount = roundMoney(returnDiscount + discount);
      returnLines.push({ line, quantity: item.quantity, value, discount });
    }

    if (returnValue <= 0) {
      throw new AppError(400, "Return value must be greater than zero");
    }

    const total = Number(existing.total);
    const paidTotal = Number(existing.paidTotal);
    const taxRatio =
      Number(existing.subtotal) > 0
        ? returnValue / Number(existing.subtotal)
        : 0;
    const taxReduction = roundMoney(Number(existing.taxTotal) * taxRatio);
    const returnAmount = roundMoney(returnValue + taxReduction);
    const remaining = roundMoney(total - paidTotal);
    const payableDebit = Math.min(returnAmount, remaining);
    const refundAmount = roundMoney(returnAmount - payableDebit);
    const exchangeRateToBase = Number(existing.exchangeRateToBase);
    const inventoryCurrency =
      existing.inventoryAccount.currencyCode ?? existing.currencyCode;
    const inventoryRateToBase =
      inventoryCurrency === existing.currencyCode
        ? exchangeRateToBase
        : await resolveRateToBase(tx, inventoryCurrency, new Date());
    const inventoryReturnValue = roundMoney(
      (returnAmount * exchangeRateToBase) / inventoryRateToBase,
    );
    const priorPayment =
      refundAmount > 0 && !input.refundAccountId
        ? await tx.payment.findFirst({
            where: { purchaseBillId: existing.id, direction: "pay" },
            orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
            select: { fromAccountId: true },
          })
        : null;
    const refundAccount =
      refundAmount > 0
        ? await resolvePaymentAccount(
            tx,
            input.refundAccountId ?? priorPayment?.fromAccountId ?? undefined,
            existing.currencyCode,
          )
        : null;

    if (refundAmount > 0 && !refundAccount) {
      throw new AppError(
        400,
        "Choose a refund account when return value exceeds remaining payable",
      );
    }

    for (const item of returnLines) {
      await decreaseInventoryBalance(
        tx,
        item.line.productId,
        item.line.locationId!,
        item.quantity,
      );
    }

    const movementNumber = await nextEntityCode(tx, "inventoryMovement");
    const journalNumber = await nextEntityCode(tx, "journal");
    const movement = await tx.inventoryMovement.create({
      data: {
        number: movementNumber,
        type: "return_out",
        status: "posted",
        movedAt: new Date(),
        valueCurrencyCode: inventoryCurrency,
        totalValue: inventoryReturnValue,
        createdById,
        notes: input.notes ?? `Return against ${existing.number}`,
        lines: {
          create: returnLines.map((item, index) => ({
            lineNo: index + 1,
            productId: item.line.productId,
            fromLocationId: item.line.locationId!,
            quantity: item.quantity,
            unitCost: roundMoney(
              (item.value * exchangeRateToBase) /
                inventoryRateToBase /
                item.quantity,
            ),
            lineValue: roundMoney(
              (item.value * exchangeRateToBase) / inventoryRateToBase,
            ),
          })),
        },
      },
    });

    const journalLines: Array<{
      lineNo: number;
      accountId: string;
      partnerId?: string;
      currencyCode: typeof existing.currencyCode;
      exchangeRateToBase: number;
      debit: number;
      credit: number;
      baseDebit: number;
      baseCredit: number;
      memo: string;
    }> = [
      {
        lineNo: 1,
        accountId: existing.inventoryAccountId,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: 0,
        credit: inventoryReturnValue,
        baseDebit: 0,
        baseCredit: inventoryReturnValue * inventoryRateToBase,
        memo: "Inventory returned to vendor",
      },
    ];

    let nextLineNo = 2;
    if (payableDebit > 0) {
      journalLines.push({
        lineNo: nextLineNo++,
        accountId: returnLedger.accountId,
        partnerId: existing.vendorId,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        debit: payableDebit,
        credit: 0,
        baseDebit: payableDebit * exchangeRateToBase,
        baseCredit: 0,
        memo: "Payable reduced by return",
      });
    }

    if (refundAmount > 0 && refundAccount) {
      journalLines.push({
        lineNo: nextLineNo++,
        accountId: refundAccount.id,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        debit: refundAmount,
        credit: 0,
        baseDebit: refundAmount * exchangeRateToBase,
        baseCredit: 0,
        memo: "Cash received from vendor return",
      });
    }

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: new Date(),
        description: input.notes ?? `Purchase return ${existing.number}`,
        status: "posted",
        sourceType: "purchase",
        sourceId: existing.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });

    await tx.inventoryMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: journalEntry.id },
    });

    await tx.returnDocument.create({
      data: {
        number: `RTN-${journalNumber}`,
        type: "purchase",
        sourceDocumentId: existing.id,
        sourceDocumentNumber: existing.number,
        journalEntryId: journalEntry.id,
        inventoryMovementId: movement.id,
        currencyCode: existing.currencyCode,
        subtotal: returnValue,
        taxTotal: taxReduction,
        total: returnAmount,
        refundTotal: refundAmount,
        linesSnapshot: returnLines.map((item) => ({
          sourceLineId: item.line.id,
          productId: item.line.productId,
          locationId: item.line.locationId,
          quantity: item.quantity,
          value: item.value,
          discount: item.discount,
        })),
        notes: input.notes,
        createdById,
      },
    });

    for (const item of returnLines) {
      const nextQty = roundMoney(Number(item.line.quantity) - item.quantity);
      if (nextQty <= 0) {
        await tx.purchaseBillLine.delete({ where: { id: item.line.id } });
      } else {
        await tx.purchaseBillLine.update({
          where: { id: item.line.id },
          data: {
            quantity: nextQty,
            lineTotal: roundMoney(Number(item.line.lineTotal) - item.value),
            discount: roundMoney(Number(item.line.discount) - item.discount),
          },
        });
      }
    }

    const nextSubtotal = roundMoney(Number(existing.subtotal) - returnValue);
    const nextDiscountTotal = roundMoney(
      Number(existing.discountTotal) - returnDiscount,
    );
    const nextTaxTotal = roundMoney(Number(existing.taxTotal) - taxReduction);
    const nextTotal = roundMoney(nextSubtotal + nextTaxTotal);
    const nextPaidTotal = roundMoney(paidTotal - refundAmount);
    const nextStatus =
      nextTotal <= 0 && nextPaidTotal <= 0
        ? ("cancelled" as const)
        : documentStatusFromPaid(nextTotal, nextPaidTotal);

    await updateAccountBalance(
      tx,
      existing.inventoryAccountId,
      inventoryCurrency,
      0,
      inventoryReturnValue,
    );
    if (payableDebit > 0) {
      await updateAccountBalance(
        tx,
        returnLedger.accountId,
        existing.currencyCode,
        payableDebit,
        0,
      );
    }
    if (refundAmount > 0 && refundAccount) {
      await updateAccountBalance(
        tx,
        refundAccount.id,
        existing.currencyCode,
        refundAmount,
        0,
      );
      const paymentNumber = await nextEntityCode(tx, "payment");
      await tx.payment.create({
        data: {
          number: paymentNumber,
          direction: "receive",
          partnerId: existing.vendorId,
          purchaseBillId: existing.id,
          fromAccountId: returnLedger.accountId,
          toAccountId: refundAccount.id,
          currencyCode: existing.currencyCode,
          exchangeRateToBase,
          amount: refundAmount,
          paymentDate: new Date(),
          journalEntryId: journalEntry.id,
          createdById,
          notes: input.notes ?? `Refund for return on ${existing.number}`,
        },
      });
    }

    return tx.purchaseBill.update({
      where: { id: existing.id },
      data: {
        subtotal: Math.max(nextSubtotal, 0),
        discountTotal: Math.max(nextDiscountTotal, 0),
        taxTotal: Math.max(nextTaxTotal, 0),
        total: Math.max(nextTotal, 0),
        paidTotal: Math.max(nextPaidTotal, 0),
        status: nextStatus,
      },
      include: purchaseInclude,
    });
  });

  return { purchase };
}
