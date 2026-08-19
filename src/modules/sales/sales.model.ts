import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import {
  assertBalancedJournalLines,
  assertValidTransactionRate,
  decreaseInventoryBalance,
  getOrCreatePartnerLedgerAccount,
  resolveAccountByType,
  increaseInventoryBalance,
  resolvePaymentAccount,
  resolveBaseCurrencyAccount,
  resolveRateToBase,
  updateAccountBalance,
} from "../../utils/accounting.js";
import { AppError } from "../../utils/app-error.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreateSaleInput,
  ListSalesQuery,
  SalePaymentInput,
  SaleReturnInput,
  UpdateSaleInput,
} from "./sales.validation.js";

const saleInclude = {
  customer: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      phone: true,
      address: true,
    },
  },

  customerLedgerAccount: {
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  },
  revenueAccount: { select: { id: true, code: true, name: true, type: true } },
  inventoryAccount: {
    select: { id: true, code: true, name: true, type: true },
  },
  cogsAccount: { select: { id: true, code: true, name: true, type: true } },
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
          fromLocation: { select: { id: true, code: true, name: true } },
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
} satisfies Prisma.SalesInvoiceInclude;

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

function lineTotal(line: CreateSaleInput["lines"][number]) {
  return roundMoney(line.quantity * line.unitPrice - line.discount);
}

async function resolveSaleInventoryRate(
  tx: Prisma.TransactionClient,
  inventoryCurrency: CreateSaleInput["currencyCode"],
  input: CreateSaleInput,
) {
  if (inventoryCurrency === input.currencyCode) return input.exchangeRateToBase;
  if (
    input.productCurrencyCode === inventoryCurrency &&
    input.productExchangeRate &&
    input.productExchangeRate > 0
  ) {
    return input.exchangeRateToBase * input.productExchangeRate;
  }
  try {
    return await resolveRateToBase(tx, inventoryCurrency, input.invoiceDate);
  } catch (error) {
    if (
      input.productCurrencyCode === inventoryCurrency &&
      input.productExchangeRate &&
      input.productExchangeRate > 0
    ) {
      return input.exchangeRateToBase * input.productExchangeRate;
    }
    throw error;
  }
}

async function getCustomerLedger(
  tx: Prisma.TransactionClient,
  customerId: string | undefined,
  currencyCode: CreateSaleInput["currencyCode"],
) {
  const walkInCode = "CUS-WALKIN";
  if (!customerId) {
    const existing = await tx.partner.findUnique({
      where: { code: walkInCode },
    });
    const customer =
      existing ??
      (await tx.partner.create({
        data: {
          code: walkInCode,
          name: "Walk-in Customer",
          type: "customer",
          isActive: true,
        },
      }));
    const { ledger } = await getOrCreatePartnerLedgerAccount(
      tx,
      customer.id,
      currencyCode,
      "receivable",
    );
    return { customer, ledger };
  }
  const { partner, ledger } = await getOrCreatePartnerLedgerAccount(
    tx,
    customerId,
    currencyCode,
    "receivable",
  );
  return { customer: partner, ledger };
}

export async function listSales(query: ListSalesQuery) {
  const pagination = getPagination(query);
  const where: Prisma.SalesInvoiceWhereInput = {
    status: query.status,
    customerId: query.customerId,
    invoiceDate: {
      gte: query.from ? startOfDay(query.from) : undefined,
      lt: query.to ? nextDay(query.to) : undefined,
    },
  };
  const [sales, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      orderBy: [{ isImportant: "desc" }, { invoiceDate: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: saleInclude,
    }),
    prisma.salesInvoice.count({ where }),
  ]);

  return paginatedResponse(sales, total, pagination.page, pagination.limit);
}

export async function getSale(id: string) {
  const sale = await prisma.salesInvoice.findUnique({
    where: { id },
    include: saleInclude,
  });

  if (!sale) {
    throw new AppError(404, "Sales invoice not found");
  }

  return { sale };
}

export async function getSaleByNumber(number: string) {
  const sale = await prisma.salesInvoice.findUnique({
    where: { number },
    include: saleInclude,
  });

  if (!sale) {
    throw new AppError(404, "Sales invoice not found");
  }

  return { sale };
}

export async function createSale(input: CreateSaleInput, createdById?: string) {
  const subtotal = input.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (subtotal < 0) {
    throw new AppError(400, "Sale subtotal cannot be negative");
  }

  const total = roundMoney(subtotal + input.taxTotal);
  if (roundMoney(input.receivedAmount) > total) {
    throw new AppError(
      400,
      "Received amount cannot be greater than sale total",
    );
  }

  const sale = await withTransaction(async (tx) => {
    await assertValidTransactionRate(tx, input.currencyCode, input.exchangeRateToBase);
    const { customer, ledger } = await getCustomerLedger(
      tx,
      input.customerId,
      input.currencyCode,
    );
    const revenueAccount = await resolveAccountByType(
      tx,
      input.revenueAccountId,
      "sales_revenue",
      input.currencyCode,
    );
    const receiptAccount =
      input.receivedAmount > 0
        ? await resolvePaymentAccount(
            tx,
            input.receiptAccountId,
            input.currencyCode,
          )
        : null;

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        standardCost: true,
        preferredPurchaseCurrency: true,
        isActive: true,
      },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    for (const line of input.lines) {
      const product = productById.get(line.productId);
      if (!product?.isActive) {
        throw new AppError(400, "Every sale line needs an active product");
      }
    }
    const costCurrencies = [
      ...new Set(products.map((product) => product.preferredPurchaseCurrency)),
    ];
    if (costCurrencies.length !== 1) {
      throw new AppError(
        400,
        "Products with different inventory currencies must be sold on separate invoices",
      );
    }
    const inventoryCurrency = costCurrencies[0];
    const inventoryAccount = await resolveAccountByType(
      tx,
      undefined,
      "inventory",
      inventoryCurrency,
    );
    const cogsAccount = await resolveAccountByType(
      tx,
      undefined,
      "cost_of_goods_sold",
      inventoryCurrency,
    );
    const inventoryRateToBase = await resolveSaleInventoryRate(
      tx,
      inventoryCurrency,
      input,
    );

    const saleNumber = await nextEntityCode(tx, "sale");
    const journalNumber = await nextEntityCode(tx, "journal");
    const movementNumber = await nextEntityCode(tx, "inventoryMovement");
    const costTotal = input.lines.reduce((sum, line) => {
      const productCost = Number(
        productById.get(line.productId)?.standardCost ?? 0,
      );
      return sum + line.quantity * productCost;
    }, 0);
    const baseTotal = total * input.exchangeRateToBase;
    const baseCostTotal = costTotal * inventoryRateToBase;
    const receivedBase = input.receivedAmount * input.exchangeRateToBase;
    const status =
      input.receivedAmount >= total && total > 0
        ? "paid"
        : input.receivedAmount > 0
          ? "partially_paid"
          : "posted";

    for (const line of input.lines) {
      await decreaseInventoryBalance(
        tx,
        line.productId,
        line.locationId,
        line.quantity,
      );
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        number: movementNumber,
        type: "sale_issue",
        status: "posted",
        movedAt: input.invoiceDate,
        valueCurrencyCode: inventoryCurrency,
        totalValue: costTotal,
        createdById,
        notes: input.notes,
        lines: {
          create: input.lines.map((line, index) => {
            const productCost = Number(
              productById.get(line.productId)?.standardCost ?? 0,
            );
            const unitCost = productCost;
            return {
              lineNo: index + 1,
              productId: line.productId,
              fromLocationId: line.locationId,
              quantity: line.quantity,
              unitCost,
              lineValue: line.quantity * unitCost,
            };
          }),
        },
      },
    });

    const journalLines = [
      {
        lineNo: 1,
        accountId: ledger.accountId,
        partnerId: customer.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: total,
        credit: 0,
        baseDebit: baseTotal,
        baseCredit: 0,
        memo: "Customer receivable",
      },
      {
        lineNo: 2,
        accountId: revenueAccount.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: 0,
        credit: total,
        baseDebit: 0,
        baseCredit: baseTotal,
        memo: "Product sale revenue",
      },
      {
        lineNo: 3,
        accountId: cogsAccount.id,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: costTotal,
        credit: 0,
        baseDebit: baseCostTotal,
        baseCredit: 0,
        memo: "Cost of goods sold",
      },
      {
        lineNo: 4,
        accountId: inventoryAccount.id,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: 0,
        credit: costTotal,
        baseDebit: 0,
        baseCredit: baseCostTotal,
        memo: "Inventory issued",
      },
    ];

    if (input.receivedAmount > 0 && receiptAccount) {
      journalLines.push(
        {
          lineNo: 5,
          accountId: receiptAccount.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: input.receivedAmount,
          credit: 0,
          baseDebit: receivedBase,
          baseCredit: 0,
          memo: "Money received from customer",
        },
        {
          lineNo: 6,
          accountId: ledger.accountId,
          partnerId: customer.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: 0,
          credit: input.receivedAmount,
          baseDebit: 0,
          baseCredit: receivedBase,
          memo: "Customer receipt applied",
        },
      );
    }

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.invoiceDate,
        description: input.notes ?? `Sales invoice ${saleNumber}`,
        status: "posted",
        sourceType: "sale",
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });

    const invoice = await tx.salesInvoice.create({
      data: {
        number: saleNumber,
        customerId: customer.id,
        customerLedgerAccountId: ledger.id,
        revenueAccountId: revenueAccount.id,
        inventoryAccountId: inventoryAccount.id,
        cogsAccountId: cogsAccount.id,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        isImportant: input.isImportant,
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
        paidTotal: input.receivedAmount,
        journalEntryId: journalEntry.id,
        inventoryMovementId: movement.id,
        createdById,
        lines: {
          create: input.lines.map((line, index) => {
            const productCost = Number(
              productById.get(line.productId)?.standardCost ?? 0,
            );
            const unitCost = productCost;
            return {
              lineNo: index + 1,
              productId: line.productId,
              locationId: line.locationId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              lineTotal: lineTotal(line),
              costTotal: line.quantity * unitCost,
            };
          }),
        },
      },
    });

    await tx.journalEntry.update({
      where: { id: journalEntry.id },
      data: { sourceId: invoice.id },
    });
    await tx.inventoryMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: journalEntry.id },
    });

    if (input.receivedAmount > 0 && receiptAccount) {
      const paymentNumber = await nextEntityCode(tx, "payment");
      await tx.payment.create({
        data: {
          number: paymentNumber,
          direction: "receive",
          partnerId: customer.id,
          salesInvoiceId: invoice.id,
          fromAccountId: ledger.accountId,
          toAccountId: receiptAccount.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          amount: input.receivedAmount,
          paymentDate: input.invoiceDate,
          journalEntryId: journalEntry.id,
          createdById,
          notes: input.notes,
        },
      });
    }

    await updateAccountBalance(
      tx,
      ledger.accountId,
      input.currencyCode,
      total,
      0,
    );
    await updateAccountBalance(
      tx,
      revenueAccount.id,
      input.currencyCode,
      0,
      total,
    );
    await updateAccountBalance(
      tx,
      cogsAccount.id,
      inventoryCurrency,
      costTotal,
      0,
    );
    await updateAccountBalance(
      tx,
      inventoryAccount.id,
      inventoryCurrency,
      0,
      costTotal,
    );
    if (input.receivedAmount > 0 && receiptAccount) {
      await updateAccountBalance(
        tx,
        receiptAccount.id,
        input.currencyCode,
        input.receivedAmount,
        0,
      );
      await updateAccountBalance(
        tx,
        ledger.accountId,
        input.currencyCode,
        0,
        input.receivedAmount,
      );
    }

    return tx.salesInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: saleInclude,
    });
  });

  return { sale };
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function documentStatusFromPaid(total: number, paidTotal: number) {
  if (paidTotal >= total && total > 0) return "paid" as const;
  if (paidTotal > 0) return "partially_paid" as const;
  return "posted" as const;
}

async function reversePostedSaleJournal(
  tx: Prisma.TransactionClient,
  sale: {
    id: string;
    number: string;
    currencyCode: CreateSaleInput["currencyCode"];
    journalEntryId: string | null;
    inventoryMovementId: string | null;
    lines: Array<{
      productId: string;
      locationId: string | null;
      quantity: Prisma.Decimal | number;
    }>;
  },
  createdById?: string,
  memoPrefix = "Reversal",
) {
  if (!sale.journalEntryId) {
    throw new AppError(400, "Sales invoice has no journal entry to reverse");
  }

  const originalJournal = await tx.journalEntry.findUnique({
    where: { id: sale.journalEntryId },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });

  if (!originalJournal || originalJournal.status !== "posted") {
    throw new AppError(400, "Original sales journal cannot be reversed");
  }

  for (const line of sale.lines) {
    if (!line.locationId) {
      throw new AppError(
        400,
        "Every sale line needs a location to reverse inventory",
      );
    }
    await increaseInventoryBalance(
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
      type: "return_in",
      status: "posted",
      movedAt: new Date(),
      valueCurrencyCode: sale.currencyCode,
      totalValue: 0,
      createdById,
      notes: `${memoPrefix} of ${sale.number}`,
      lines: {
        create: sale.lines.map((line, index) => ({
          lineNo: index + 1,
          productId: line.productId,
          toLocationId: line.locationId!,
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
    memo: `${memoPrefix}: ${line.memo ?? sale.number}`,
  }));

  assertBalancedJournalLines(reversingLines);

  const reversalJournal = await tx.journalEntry.create({
    data: {
      number: journalNumber,
      entryDate: new Date(),
      description: `${memoPrefix} of sales invoice ${sale.number}`,
      status: "posted",
      sourceType: "sale",
      sourceId: sale.id,
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

export async function receiveSalePayment(
  saleId: string,
  input: SalePaymentInput,
  createdById?: string,
) {
  const sale = await withTransaction(async (tx) => {
    const existing = await tx.salesInvoice.findUnique({
      where: { id: saleId },
      include: {
        customerLedgerAccount: true,
        customer: { select: { id: true } },
      },
    });

    if (!existing) {
      throw new AppError(404, "Sales invoice not found");
    }
    if (existing.status === "cancelled") {
      throw new AppError(
        400,
        "Cannot receive payment on a cancelled sales invoice",
      );
    }

    const total = Number(existing.total);
    const paidTotal = Number(existing.paidTotal);
    const remaining = roundMoney(total - paidTotal);
    if (remaining <= 0) {
      throw new AppError(400, "Sales invoice is already fully paid");
    }
    if (input.amount > remaining) {
      throw new AppError(400, "Payment amount cannot exceed remaining balance");
    }

    const paymentDate = input.paymentDate ?? new Date();
    const documentRate = Number(existing.exchangeRateToBase);
    await assertValidTransactionRate(tx, existing.currencyCode, documentRate);
    const selectedAccount = input.receiptAccountId
      ? await tx.account.findUnique({
          where: { id: input.receiptAccountId },
          select: { currencyCode: true },
        })
      : null;
    const accountCurrencyCode =
      selectedAccount?.currencyCode ?? existing.currencyCode;
    const accountRateToBase = await resolveRateToBase(
      tx,
      accountCurrencyCode,
      paymentDate,
    );
    const accountAmount =
      accountCurrencyCode === existing.currencyCode
        ? input.amount
        : input.paymentExchangeRate
          ? input.amount * input.paymentExchangeRate
          : (input.amount * documentRate) / accountRateToBase;
    const receiptAccount = await resolvePaymentAccount(
      tx,
      input.receiptAccountId,
      accountCurrencyCode,
    );
    const amountBase = input.amount * documentRate;
    const accountLineRate = amountBase / accountAmount;
    const journalNumber = await nextEntityCode(tx, "journal");
    const paymentNumber = await nextEntityCode(tx, "payment");

    const journalLines = [
      {
        lineNo: 1,
        accountId: receiptAccount.id,
        currencyCode: accountCurrencyCode,
        exchangeRateToBase: accountLineRate,
        debit: accountAmount,
        credit: 0,
        baseDebit: amountBase,
        baseCredit: 0,
        memo: "Customer payment received",
      },
      {
        lineNo: 2,
        accountId: existing.customerLedgerAccount.accountId,
        partnerId: existing.customerId,
        currencyCode: existing.currencyCode,
        exchangeRateToBase: documentRate,
        debit: 0,
        credit: input.amount,
        baseDebit: 0,
        baseCredit: amountBase,
        memo: "Receivable payment applied",
      },
    ];

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
        direction: "receive",
        partnerId: existing.customerId,
        salesInvoiceId: existing.id,
        fromAccountId: existing.customerLedgerAccount.accountId,
        toAccountId: receiptAccount.id,
        currencyCode: existing.currencyCode,
        exchangeRateToBase: documentRate,
        amount: input.amount,
        paymentDate,
        journalEntryId: journalEntry.id,
        createdById,
        notes: input.notes,
      },
    });

    await updateAccountBalance(
      tx,
      receiptAccount.id,
      accountCurrencyCode,
      accountAmount,
      0,
    );
    await updateAccountBalance(
      tx,
      existing.customerLedgerAccount.accountId,
      existing.currencyCode,
      0,
      input.amount,
    );

    return tx.salesInvoice.update({
      where: { id: existing.id },
      data: { paidTotal: nextPaidTotal, status: nextStatus },
      include: saleInclude,
    });
  });

  return { sale };
}

export async function cancelSale(saleId: string, createdById?: string) {
  const sale = await withTransaction(async (tx) => {
    const existing = await tx.salesInvoice.findUnique({
      where: { id: saleId },
      include: { lines: true },
    });

    if (!existing) {
      throw new AppError(404, "Sales invoice not found");
    }
    if (existing.status === "cancelled") {
      throw new AppError(400, "Sales invoice is already cancelled");
    }
    if (existing.status !== "posted" || Number(existing.paidTotal) !== 0) {
      throw new AppError(
        400,
        "Only unpaid posted sales invoices can be cancelled. Pay or return first, or keep the invoice and create a replacement.",
      );
    }

    await reversePostedSaleJournal(tx, existing, createdById, "Cancellation");

    return tx.salesInvoice.update({
      where: { id: existing.id },
      data: { status: "cancelled" },
      include: saleInclude,
    });
  });

  return { sale };
}

export async function updateSale(
  saleId: string,
  input: UpdateSaleInput,
  createdById?: string,
) {
  const subtotal = input.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  if (subtotal < 0) {
    throw new AppError(400, "Sale subtotal cannot be negative");
  }
  const total = roundMoney(subtotal + input.taxTotal);
  if (roundMoney(input.receivedAmount) > total) {
    throw new AppError(
      400,
      "Received amount cannot be greater than sale total",
    );
  }

  const sale = await withTransaction(async (tx) => {
    await assertValidTransactionRate(tx, input.currencyCode, input.exchangeRateToBase);
    const existing = await tx.salesInvoice.findUnique({
      where: { id: saleId },
      include: { lines: true },
    });

    if (!existing) {
      throw new AppError(404, "Sales invoice not found");
    }
    if (existing.status !== "posted" || Number(existing.paidTotal) !== 0) {
      throw new AppError(
        400,
        "Only unpaid posted sales invoices can be edited. Cancel and recreate if payments already exist.",
      );
    }
    if (input.currencyCode !== existing.currencyCode) {
      throw new AppError(
        400,
        "Cannot change currency on an existing sales invoice",
      );
    }

    await reversePostedSaleJournal(tx, existing, createdById, "Edit reversal");

    const { customer, ledger } = await getCustomerLedger(
      tx,
      input.customerId,
      input.currencyCode,
    );
    const revenueAccount = await resolveAccountByType(
      tx,
      input.revenueAccountId,
      "sales_revenue",
      input.currencyCode,
    );
    const receiptAccount =
      input.receivedAmount > 0
        ? await resolvePaymentAccount(
            tx,
            input.receiptAccountId,
            input.currencyCode,
          )
        : null;

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        standardCost: true,
        preferredPurchaseCurrency: true,
        isActive: true,
      },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    for (const line of input.lines) {
      const product = productById.get(line.productId);
      if (!product?.isActive) {
        throw new AppError(400, "Every sale line needs an active product");
      }
    }

    const costCurrencies = [
      ...new Set(products.map((product) => product.preferredPurchaseCurrency)),
    ];
    if (costCurrencies.length !== 1) {
      throw new AppError(
        400,
        "Products with different inventory currencies must be sold on separate invoices",
      );
    }
    const inventoryCurrency = costCurrencies[0];
    const inventoryAccount = await resolveAccountByType(
      tx,
      undefined,
      "inventory",
      inventoryCurrency,
    );
    const cogsAccount = await resolveAccountByType(
      tx,
      undefined,
      "cost_of_goods_sold",
      inventoryCurrency,
    );
    const inventoryRateToBase = await resolveSaleInventoryRate(
      tx,
      inventoryCurrency,
      input,
    );

    const journalNumber = await nextEntityCode(tx, "journal");
    const movementNumber = await nextEntityCode(tx, "inventoryMovement");
    const costTotal = input.lines.reduce((sum, line) => {
      const productCost = Number(
        productById.get(line.productId)?.standardCost ?? 0,
      );
      return sum + line.quantity * productCost;
    }, 0);
    const baseTotal = total * input.exchangeRateToBase;
    const baseCostTotal = costTotal * inventoryRateToBase;
    const receivedBase = input.receivedAmount * input.exchangeRateToBase;
    const status = documentStatusFromPaid(total, input.receivedAmount);

    for (const line of input.lines) {
      await decreaseInventoryBalance(
        tx,
        line.productId,
        line.locationId,
        line.quantity,
      );
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        number: movementNumber,
        type: "sale_issue",
        status: "posted",
        movedAt: input.invoiceDate,
        valueCurrencyCode: inventoryCurrency,
        totalValue: costTotal,
        createdById,
        notes: input.notes,
        lines: {
          create: input.lines.map((line, index) => {
            const productCost = Number(
              productById.get(line.productId)?.standardCost ?? 0,
            );
            const unitCost = productCost;
            return {
              lineNo: index + 1,
              productId: line.productId,
              fromLocationId: line.locationId,
              quantity: line.quantity,
              unitCost,
              lineValue: line.quantity * unitCost,
            };
          }),
        },
      },
    });

    const journalLines = [
      {
        lineNo: 1,
        accountId: ledger.accountId,
        partnerId: customer.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: total,
        credit: 0,
        baseDebit: baseTotal,
        baseCredit: 0,
        memo: "Customer receivable",
      },
      {
        lineNo: 2,
        accountId: revenueAccount.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: 0,
        credit: total,
        baseDebit: 0,
        baseCredit: baseTotal,
        memo: "Product sale revenue",
      },
      {
        lineNo: 3,
        accountId: cogsAccount.id,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: costTotal,
        credit: 0,
        baseDebit: baseCostTotal,
        baseCredit: 0,
        memo: "Cost of goods sold",
      },
      {
        lineNo: 4,
        accountId: inventoryAccount.id,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: 0,
        credit: costTotal,
        baseDebit: 0,
        baseCredit: baseCostTotal,
        memo: "Inventory issued",
      },
    ];

    if (input.receivedAmount > 0 && receiptAccount) {
      journalLines.push(
        {
          lineNo: 5,
          accountId: receiptAccount.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: input.receivedAmount,
          credit: 0,
          baseDebit: receivedBase,
          baseCredit: 0,
          memo: "Money received from customer",
        },
        {
          lineNo: 6,
          accountId: ledger.accountId,
          partnerId: customer.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          debit: 0,
          credit: input.receivedAmount,
          baseDebit: 0,
          baseCredit: receivedBase,
          memo: "Customer receipt applied",
        },
      );
    }

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.invoiceDate,
        description: input.notes ?? `Sales invoice ${existing.number}`,
        status: "posted",
        sourceType: "sale",
        sourceId: existing.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });

    await tx.salesInvoiceLine.deleteMany({
      where: { salesInvoiceId: existing.id },
    });

    await tx.salesInvoice.update({
      where: { id: existing.id },
      data: {
        customerId: customer.id,
        customerLedgerAccountId: ledger.id,
        revenueAccountId: revenueAccount.id,
        inventoryAccountId: inventoryAccount.id,
        cogsAccountId: cogsAccount.id,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        isImportant: input.isImportant,
        status,
        exchangeRateToBase: input.exchangeRateToBase,
        subtotal,
        discountTotal: input.lines.reduce(
          (sum, line) => sum + line.discount,
          0,
        ),
        taxTotal: input.taxTotal,
        total,
        paidTotal: input.receivedAmount,
        journalEntryId: journalEntry.id,
        inventoryMovementId: movement.id,
        lines: {
          create: input.lines.map((line, index) => {
            const productCost = Number(
              productById.get(line.productId)?.standardCost ?? 0,
            );
            const unitCost = productCost;
            return {
              lineNo: index + 1,
              productId: line.productId,
              locationId: line.locationId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              lineTotal: lineTotal(line),
              costTotal: line.quantity * unitCost,
            };
          }),
        },
      },
    });

    await tx.inventoryMovement.update({
      where: { id: movement.id },
      data: { journalEntryId: journalEntry.id },
    });

    if (input.receivedAmount > 0 && receiptAccount) {
      const paymentNumber = await nextEntityCode(tx, "payment");
      await tx.payment.create({
        data: {
          number: paymentNumber,
          direction: "receive",
          partnerId: customer.id,
          salesInvoiceId: existing.id,
          fromAccountId: ledger.accountId,
          toAccountId: receiptAccount.id,
          currencyCode: input.currencyCode,
          exchangeRateToBase: input.exchangeRateToBase,
          amount: input.receivedAmount,
          paymentDate: input.invoiceDate,
          journalEntryId: journalEntry.id,
          createdById,
          notes: input.notes,
        },
      });
    }

    await updateAccountBalance(
      tx,
      ledger.accountId,
      input.currencyCode,
      total,
      0,
    );
    await updateAccountBalance(
      tx,
      revenueAccount.id,
      input.currencyCode,
      0,
      total,
    );
    await updateAccountBalance(
      tx,
      cogsAccount.id,
      inventoryCurrency,
      costTotal,
      0,
    );
    await updateAccountBalance(
      tx,
      inventoryAccount.id,
      inventoryCurrency,
      0,
      costTotal,
    );
    if (input.receivedAmount > 0 && receiptAccount) {
      await updateAccountBalance(
        tx,
        receiptAccount.id,
        input.currencyCode,
        input.receivedAmount,
        0,
      );
      await updateAccountBalance(
        tx,
        ledger.accountId,
        input.currencyCode,
        0,
        input.receivedAmount,
      );
    }

    return tx.salesInvoice.findUniqueOrThrow({
      where: { id: existing.id },
      include: saleInclude,
    });
  });

  return { sale };
}

export async function returnSaleProducts(
  saleId: string,
  input: SaleReturnInput,
  createdById?: string,
) {
  const sale = await withTransaction(async (tx) => {
    const existing = await tx.salesInvoice.findUnique({
      where: { id: saleId },
      include: {
        lines: true,
        customerLedgerAccount: true,
        inventoryAccount: true,
      },
    });

    if (!existing) {
      throw new AppError(404, "Sales invoice not found");
    }
    if (existing.status === "cancelled") {
      throw new AppError(
        400,
        "Cannot return products on a cancelled sales invoice",
      );
    }
    const { ledger: returnLedger } = await getCustomerLedger(
      tx,
      existing.customerId,
      existing.currencyCode,
    );
    if (existing.customerLedgerAccountId !== returnLedger.id) {
      await tx.salesInvoice.update({
        where: { id: existing.id },
        data: { customerLedgerAccountId: returnLedger.id },
      });
    }
    const inventoryCurrency =
      existing.inventoryAccount.currencyCode ?? existing.currencyCode;
    const inventoryRateToBase =
      inventoryCurrency === existing.currencyCode
        ? Number(existing.exchangeRateToBase)
        : await resolveRateToBase(tx, inventoryCurrency, new Date());

    const lineById = new Map(existing.lines.map((line) => [line.id, line]));
    let returnRevenue = 0;
    let returnCost = 0;
    let returnDiscount = 0;
    const returnLines: Array<{
      line: (typeof existing.lines)[number];
      quantity: number;
      revenue: number;
      cost: number;
      discount: number;
    }> = [];

    for (const item of input.lines) {
      const line = lineById.get(item.lineId);
      if (!line) {
        throw new AppError(
          400,
          "Return line does not belong to this sales invoice",
        );
      }
      if (!line.locationId) {
        throw new AppError(400, "Sale line is missing inventory location");
      }
      const currentQty = Number(line.quantity);
      if (item.quantity > currentQty) {
        throw new AppError(400, "Return quantity cannot exceed sold quantity");
      }
      const ratio = item.quantity / currentQty;
      const revenue = roundMoney(Number(line.lineTotal) * ratio);
      const cost = roundMoney(Number(line.costTotal) * ratio);
      const discount = roundMoney(Number(line.discount) * ratio);
      returnRevenue = roundMoney(returnRevenue + revenue);
      returnCost = roundMoney(returnCost + cost);
      returnDiscount = roundMoney(returnDiscount + discount);
      returnLines.push({
        line,
        quantity: item.quantity,
        revenue,
        cost,
        discount,
      });
    }

    if (returnRevenue <= 0) {
      throw new AppError(400, "Return value must be greater than zero");
    }

    const total = Number(existing.total);
    const paidTotal = Number(existing.paidTotal);
    const taxRatio =
      Number(existing.subtotal) > 0
        ? returnRevenue / Number(existing.subtotal)
        : 0;
    const taxReduction = roundMoney(Number(existing.taxTotal) * taxRatio);
    const returnAmount = roundMoney(returnRevenue + taxReduction);
    const remaining = roundMoney(total - paidTotal);
    const receivableCredit = Math.min(returnAmount, remaining);
    const refundAmount = roundMoney(returnAmount - receivableCredit);
    const exchangeRateToBase = Number(existing.exchangeRateToBase);
    const priorPayment =
      refundAmount > 0 && !input.refundAccountId
        ? await tx.payment.findFirst({
            where: { salesInvoiceId: existing.id, direction: "receive" },
            orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
            select: { toAccountId: true },
          })
        : null;
    const refundAccount =
      refundAmount > 0
        ? await resolvePaymentAccount(
            tx,
            input.refundAccountId ?? priorPayment?.toAccountId ?? undefined,
            existing.currencyCode,
            refundAmount,
          )
        : null;

    if (refundAmount > 0 && !refundAccount) {
      throw new AppError(
        400,
        "Choose a refund account when return value exceeds remaining receivable",
      );
    }

    for (const item of returnLines) {
      await increaseInventoryBalance(
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
        type: "return_in",
        status: "posted",
        movedAt: new Date(),
        valueCurrencyCode: inventoryCurrency,
        totalValue: returnCost,
        createdById,
        notes: input.notes ?? `Return against ${existing.number}`,
        lines: {
          create: returnLines.map((item, index) => ({
            lineNo: index + 1,
            productId: item.line.productId,
            toLocationId: item.line.locationId!,
            quantity: item.quantity,
            unitCost: roundMoney(item.cost / item.quantity),
            lineValue: item.cost,
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
        accountId: existing.revenueAccountId,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        debit: returnAmount,
        credit: 0,
        baseDebit: returnAmount * exchangeRateToBase,
        baseCredit: 0,
        memo: "Sales return",
      },
    ];

    let nextLineNo = 2;
    if (receivableCredit > 0) {
      journalLines.push({
        lineNo: nextLineNo++,
        accountId: returnLedger.accountId,
        partnerId: existing.customerId,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        debit: 0,
        credit: receivableCredit,
        baseDebit: 0,
        baseCredit: receivableCredit * exchangeRateToBase,
        memo: "Receivable reduced by return",
      });
    }

    if (refundAmount > 0 && refundAccount) {
      journalLines.push({
        lineNo: nextLineNo++,
        accountId: refundAccount.id,
        currencyCode: existing.currencyCode,
        exchangeRateToBase,
        debit: 0,
        credit: refundAmount,
        baseDebit: 0,
        baseCredit: refundAmount * exchangeRateToBase,
        memo: "Cash refund for returned goods",
      });
    }

    journalLines.push(
      {
        lineNo: nextLineNo++,
        accountId: existing.inventoryAccountId,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: returnCost,
        credit: 0,
        baseDebit: returnCost * inventoryRateToBase,
        baseCredit: 0,
        memo: "Inventory returned",
      },
      {
        lineNo: nextLineNo++,
        accountId: existing.cogsAccountId,
        currencyCode: inventoryCurrency,
        exchangeRateToBase: inventoryRateToBase,
        debit: 0,
        credit: returnCost,
        baseDebit: 0,
        baseCredit: returnCost * inventoryRateToBase,
        memo: "COGS reversed",
      },
    );

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: new Date(),
        description: input.notes ?? `Sales return ${existing.number}`,
        status: "posted",
        sourceType: "sale",
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
        type: "sale",
        sourceDocumentId: existing.id,
        sourceDocumentNumber: existing.number,
        journalEntryId: journalEntry.id,
        inventoryMovementId: movement.id,
        currencyCode: existing.currencyCode,
        subtotal: returnRevenue,
        taxTotal: taxReduction,
        total: returnAmount,
        refundTotal: refundAmount,
        linesSnapshot: returnLines.map((item) => ({
          sourceLineId: item.line.id,
          productId: item.line.productId,
          locationId: item.line.locationId,
          quantity: item.quantity,
          revenue: item.revenue,
          cost: item.cost,
          discount: item.discount,
        })),
        notes: input.notes,
        createdById,
      },
    });

    for (const item of returnLines) {
      const nextQty = roundMoney(Number(item.line.quantity) - item.quantity);
      if (nextQty <= 0) {
        await tx.salesInvoiceLine.delete({ where: { id: item.line.id } });
      } else {
        await tx.salesInvoiceLine.update({
          where: { id: item.line.id },
          data: {
            quantity: nextQty,
            lineTotal: roundMoney(Number(item.line.lineTotal) - item.revenue),
            costTotal: roundMoney(Number(item.line.costTotal) - item.cost),
            discount: roundMoney(Number(item.line.discount) - item.discount),
          },
        });
      }
    }

    const nextSubtotal = roundMoney(Number(existing.subtotal) - returnRevenue);
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
      existing.revenueAccountId,
      existing.currencyCode,
      returnAmount,
      0,
    );
    await updateAccountBalance(
      tx,
      returnLedger.accountId,
      existing.currencyCode,
      0,
      receivableCredit,
    );
    await updateAccountBalance(
      tx,
      existing.inventoryAccountId,
      inventoryCurrency,
      returnCost,
      0,
    );
    await updateAccountBalance(
      tx,
      existing.cogsAccountId,
      inventoryCurrency,
      0,
      returnCost,
    );
    if (refundAmount > 0 && refundAccount) {
      await updateAccountBalance(
        tx,
        refundAccount.id,
        existing.currencyCode,
        0,
        refundAmount,
      );
    }

    if (refundAmount > 0 && refundAccount) {
      const paymentNumber = await nextEntityCode(tx, "payment");
      await tx.payment.create({
        data: {
          number: paymentNumber,
          direction: "pay",
          partnerId: existing.customerId,
          salesInvoiceId: existing.id,
          fromAccountId: refundAccount.id,
          toAccountId: returnLedger.accountId,
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

    return tx.salesInvoice.update({
      where: { id: existing.id },
      data: {
        subtotal: Math.max(nextSubtotal, 0),
        discountTotal: Math.max(nextDiscountTotal, 0),
        taxTotal: Math.max(nextTaxTotal, 0),
        total: Math.max(nextTotal, 0),
        paidTotal: Math.max(nextPaidTotal, 0),
        status: nextStatus,
      },
      include: saleInclude,
    });
  });

  return { sale };
}
