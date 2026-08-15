import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import {
  assertBalancedJournalLines,
  getOrCreatePartnerLedgerAccount,
  resolvePaymentAccount,
  resolveRateToBase,
  updateAccountBalance,
} from "../../utils/accounting.js";
import { nextEntityCode, partnerCodeKey } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreatePartnerInput,
  CreatePartnerLedgerAccountInput,
  ListPartnersQuery,
  RecordPartnerPaymentInput,
  UpdatePartnerInput,
} from "./partners.validation.js";

const partnerInclude = {
  receivableAccount: {
    select: { id: true, code: true, name: true },
  },
  payableAccount: {
    select: { id: true, code: true, name: true },
  },
  ledgerAccounts: {
    include: {
      account: {
        select: { id: true, code: true, name: true, type: true },
      },
      currency: true,
    },
    orderBy: [{ type: "asc" }, { currencyCode: "asc" }],
  },
} satisfies Prisma.PartnerInclude;

function canHaveReceivable(type: string) {
  return ["customer", "both", "sarafi", "staff"].includes(type);
}

function canHavePayable(type: string) {
  return ["vendor", "both", "sarafi", "staff"].includes(type);
}

async function resolveControlAccountId(
  tx: Prisma.TransactionClient,
  accountId: string | undefined,
  type: "accounts_receivable" | "accounts_payable",
) {
  if (accountId) return accountId;

  const account = await tx.account.findFirst({
    where: { type, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true },
  });

  if (!account) {
    throw new AppError(
      400,
      `No active ${type.replaceAll("_", " ")} control account is configured`,
    );
  }

  return account.id;
}

function mapUniqueError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(409, "Partner or ledger account already exists");
  }

  throw error;
}

export async function listPartners(query: ListPartnersQuery) {
  const pagination = getPagination(query);
  const where = {
    type: query.type,
    isActive: query.isActive,
  };
  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: partnerInclude,
    }),
    prisma.partner.count({ where }),
  ]);

  return paginatedResponse(partners, total, pagination.page, pagination.limit);
}

export async function getPartner(partnerId: string) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: partnerInclude,
  });

  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  return { partner };
}

export async function getPartnerByCode(code: string) {
  const partner = await prisma.partner.findUnique({
    where: { code },
    include: partnerInclude,
  });

  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  return { partner };
}

export async function createPartner(input: CreatePartnerInput) {
  try {
    const partner = await withTransaction(async (tx) => {
      const code =
        input.code ?? (await nextEntityCode(tx, partnerCodeKey(input.type)));
      const receivableAccountId = canHaveReceivable(input.type)
        ? await resolveControlAccountId(
            tx,
            input.receivableAccountId,
            "accounts_receivable",
          )
        : undefined;
      const payableAccountId = canHavePayable(input.type)
        ? await resolveControlAccountId(
            tx,
            input.payableAccountId,
            "accounts_payable",
          )
        : undefined;
      const createdPartner = await tx.partner.create({
        data: {
          code,
          name: input.name,
          type: input.type,
          phone: input.phone,
          address: input.address,
          receivableAccountId,
          payableAccountId,
          isActive: input.isActive,
        },
      });

      const ledgerRows = input.ledgerCurrencies.flatMap((currencyCode) => {
        const rows = [];

        if (canHaveReceivable(input.type) && receivableAccountId) {
          rows.push({
            partnerId: createdPartner.id,
            accountId: receivableAccountId,
            currencyCode,
            type: "receivable" as const,
            isDefault: currencyCode === input.ledgerCurrencies[0],
          });
        }

        if (canHavePayable(input.type) && payableAccountId) {
          rows.push({
            partnerId: createdPartner.id,
            accountId: payableAccountId,
            currencyCode,
            type: "payable" as const,
            isDefault: currencyCode === input.ledgerCurrencies[0],
          });
        }

        return rows;
      });

      if (ledgerRows.length > 0) {
        await tx.partnerLedgerAccount.createMany({ data: ledgerRows });
      }

      return tx.partner.findUniqueOrThrow({
        where: { id: createdPartner.id },
        include: partnerInclude,
      });
    });

    return { partner };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updatePartner(
  partnerId: string,
  input: UpdatePartnerInput,
) {
  try {
    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: input,
      include: partnerInclude,
    });

    return { partner };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function deletePartner(partnerId: string) {
  try {
    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: { isActive: false },
      include: partnerInclude,
    });

    return { partner };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function createPartnerLedgerAccount(
  partnerId: string,
  input: CreatePartnerLedgerAccountInput,
) {
  try {
    const ledgerAccount = await prisma.partnerLedgerAccount.create({
      data: {
        partnerId,
        accountId: input.accountId,
        currencyCode: input.currencyCode,
        type: input.type,
        isDefault: input.isDefault,
      },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true },
        },
        currency: true,
      },
    });

    return { ledgerAccount };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function recordPartnerPayment(
  partnerId: string,
  input: RecordPartnerPaymentInput,
  createdById?: string,
) {
  const payment = await withTransaction(async (tx) => {
    const partner = await tx.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, type: true, isActive: true },
    });
    if (!partner?.isActive)
      throw new AppError(400, "Partner must be active for this transaction");

    const ledgerType = input.direction === "receive" ? "receivable" : "payable";
    const permittedTypes =
      input.direction === "receive" ? ["customer", "both"] : ["vendor", "both"];
    if (!permittedTypes.includes(partner.type)) {
      throw new AppError(
        400,
        input.direction === "receive"
          ? "Receipts can only be recorded for customers"
          : "Payments can only be recorded for suppliers",
      );
    }

    const ledgerResult = await getOrCreatePartnerLedgerAccount(
      tx,
      partnerId,
      input.currencyCode,
      ledgerType,
    );
    const selectedAccount = await tx.account.findUnique({
      where: { id: input.accountId },
      select: { currencyCode: true },
    });
    const accountCurrencyCode =
      selectedAccount?.currencyCode ?? input.currencyCode;
    const exchangeRateToBase = await resolveRateToBase(
      tx,
      input.currencyCode,
      input.paymentDate,
    );
    const accountRateToBase = await resolveRateToBase(
      tx,
      accountCurrencyCode,
      input.paymentDate,
    );
    const accountAmount =
      (input.amount * exchangeRateToBase) / accountRateToBase;
    const transactionAccount = await resolvePaymentAccount(
      tx,
      input.accountId,
      accountCurrencyCode,
      input.direction === "pay" ? accountAmount : undefined,
    );
    const amountBase = input.amount * exchangeRateToBase;
    const accountLineRate = amountBase / accountAmount;
    /*
     * The partner balance is settled in its own currency. When the selected
     * cash/bank account has another currency, its amount is converted at the
     * transaction-date rate while both journal lines retain the same base value.
     */
    const partnerAccountId = ledgerResult.ledger.accountId;
    const isReceipt = input.direction === "receive";
    const partnerTotals = await tx.journalLine.aggregate({
      where: {
        accountId: partnerAccountId,
        partnerId,
        currencyCode: input.currencyCode,
        journalEntry: { status: { in: ["posted", "reversed"] } },
      },
      _sum: { debit: true, credit: true },
    });
    const outstanding = isReceipt
      ? Number(partnerTotals._sum.debit ?? 0) -
        Number(partnerTotals._sum.credit ?? 0)
      : Number(partnerTotals._sum.credit ?? 0) -
        Number(partnerTotals._sum.debit ?? 0);
    if (input.amount > outstanding) {
      throw new AppError(
        400,
        "Payment amount exceeds the partner's outstanding balance",
      );
    }
    const journalLines = [
      {
        lineNo: 1,
        accountId: isReceipt ? transactionAccount.id : partnerAccountId,
        partnerId: isReceipt ? undefined : partnerId,
        currencyCode: isReceipt ? accountCurrencyCode : input.currencyCode,
        exchangeRateToBase: isReceipt ? accountLineRate : exchangeRateToBase,
        debit: isReceipt ? accountAmount : input.amount,
        credit: 0,
        baseDebit: amountBase,
        baseCredit: 0,
        memo: isReceipt ? "Customer receipt" : "Supplier payment",
      },
      {
        lineNo: 2,
        accountId: isReceipt ? partnerAccountId : transactionAccount.id,
        partnerId: isReceipt ? partnerId : undefined,
        currencyCode: isReceipt ? input.currencyCode : accountCurrencyCode,
        exchangeRateToBase: isReceipt ? exchangeRateToBase : accountLineRate,
        debit: 0,
        credit: isReceipt ? input.amount : accountAmount,
        baseDebit: 0,
        baseCredit: amountBase,
        memo: isReceipt ? "Customer receipt" : "Supplier payment",
      },
    ];
    assertBalancedJournalLines(journalLines);

    const [paymentNumber, journalNumber] = await Promise.all([
      nextEntityCode(tx, "payment"),
      nextEntityCode(tx, "journal"),
    ]);
    const createdPayment = await tx.payment.create({
      data: {
        number: paymentNumber,
        direction: input.direction,
        partnerId,
        fromAccountId: isReceipt ? partnerAccountId : transactionAccount.id,
        toAccountId: isReceipt ? transactionAccount.id : partnerAccountId,
        currencyCode: input.currencyCode,
        exchangeRateToBase,
        amount: input.amount,
        paymentDate: input.paymentDate,
        createdById,
        notes: input.notes,
      },
    });
    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.paymentDate,
        description:
          input.notes ??
          `${isReceipt ? "Receipt from" : "Payment to"} ${partner.name}`,
        status: "posted",
        sourceType: "payment",
        sourceId: createdPayment.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines },
      },
    });
    await tx.payment.update({
      where: { id: createdPayment.id },
      data: { journalEntryId: journalEntry.id },
    });
    await updateAccountBalance(
      tx,
      transactionAccount.id,
      accountCurrencyCode,
      isReceipt ? accountAmount : 0,
      isReceipt ? 0 : accountAmount,
    );
    await updateAccountBalance(
      tx,
      partnerAccountId,
      input.currencyCode,
      isReceipt ? 0 : input.amount,
      isReceipt ? input.amount : 0,
    );
    return tx.payment.findUniqueOrThrow({ where: { id: createdPayment.id } });
  });

  return { payment };
}
