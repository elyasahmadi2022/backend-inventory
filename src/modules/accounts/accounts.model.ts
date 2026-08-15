import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import {
  assertBalancedJournalLines,
  resolvePaymentAccount,
  updateAccountBalance
} from "../../utils/accounting.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreateAccountInput,
  ListAccountsQuery,
  RecordExpenseInput,
  RecordFundingInput,
  UpdateAccountInput
} from "./accounts.validation.js";

const accountInclude = {
  currency: true,
  parent: {
    select: { id: true, code: true, name: true }
  },
  balances: true
};

function mapUniqueError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(409, "Account code already exists");
  }

  throw error;
}

export async function listAccounts(query: ListAccountsQuery) {
  const pagination = getPagination(query);
  const where = {
    type: query.type,
    category: query.category,
    currencyCode: query.currencyCode,
    isActive: query.isActive
  };
  const allAccounts = await prisma.account.findMany({
    where,
    orderBy: { code: "asc" },
    include: accountInclude
  });
  allAccounts.sort((left, right) => {
    const leftHasBalance = left.balances.some((balance) => Number(balance.balance) !== 0);
    const rightHasBalance = right.balances.some((balance) => Number(balance.balance) !== 0);
    if (leftHasBalance !== rightHasBalance) return leftHasBalance ? -1 : 1;
    return left.code.localeCompare(right.code);
  });
  const total = allAccounts.length;
  const accounts = allAccounts.slice(pagination.skip, pagination.skip + pagination.take);

  return paginatedResponse(accounts, total, pagination.page, pagination.limit);
}

export async function getAccount(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      ...accountInclude,
      children: {
        select: { id: true, code: true, name: true, type: true }
      }
    }
  });

  if (!account) {
    throw new AppError(404, "Account not found");
  }

  return { account };
}

export async function getAccountByCode(code: string) {
  const account = await prisma.account.findUnique({
    where: { code },
    include: {
      ...accountInclude,
      children: {
        select: { id: true, code: true, name: true, type: true }
      }
    }
  });

  if (!account) {
    throw new AppError(404, "Account not found");
  }

  return { account };
}

export async function createAccount(input: CreateAccountInput) {
  try {
    const account = await withTransaction(async (tx) => {
      const code = input.code ?? (await nextEntityCode(tx, "account"));

      return tx.account.create({
        data: { ...input, code },
        include: accountInclude
      });
    });

    return { account };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updateAccount(accountId: string, input: UpdateAccountInput) {
  try {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: input,
      include: accountInclude
    });

    return { account };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function deleteAccount(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          children: true,
          balances: true,
          journalLines: true,
          customerPartners: true,
          vendorPartners: true,
          partnerLedgerAccounts: true,
          salesRevenueInvoices: true,
          salesInventoryInvoices: true,
          salesCogsInvoices: true,
          purchaseInventoryBills: true,
          purchaseExpenseBills: true,
          paymentsFromAccount: true,
          paymentsToAccount: true,
          transfersFromAccount: true,
          transfersToAccount: true
        }
      }
    }
  });

  if (!account) {
    throw new AppError(404, "Account not found");
  }

  const linkedCount = Object.values(account._count).reduce(
    (total, value) => total + Number(value ?? 0),
    0
  );

  if (linkedCount > 0) {
    throw new AppError(
      400,
      "This account cannot be deleted because it is already linked to balances, transactions, partners, or child accounts."
    );
  }

  try {
    const deleted = await prisma.account.delete({
      where: { id: accountId },
      include: accountInclude
    });

    return { account: deleted };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new AppError(
        400,
        "This account cannot be deleted because it is already linked to other records."
      );
    }

    throw error;
  }
}

export async function recordExpense(
  input: RecordExpenseInput,
  createdById?: string
) {
  const payment = await withTransaction(async (tx) => {
    const expenseAccount = await tx.account.findUnique({
      where: { id: input.expenseAccountId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        category: true,
        currencyCode: true
      }
    });

    if (!expenseAccount?.isActive || expenseAccount.category !== "expense") {
      throw new AppError(
        400,
        "Expense account must exist, be active, and belong to expenses"
      );
    }

    if (
      expenseAccount.currencyCode &&
      expenseAccount.currencyCode !== input.currencyCode
    ) {
      throw new AppError(
        400,
        "Selected expense account currency does not match expense currency"
      );
    }

    const paymentAccount = await resolvePaymentAccount(
      tx,
      input.paymentAccountId,
      input.currencyCode,
      input.amount
    );

    const amountBase = input.amount * input.exchangeRateToBase;
    const paymentNumber = await nextEntityCode(tx, "payment");
    const journalNumber = await nextEntityCode(tx, "journal");

    const createdPayment = await tx.payment.create({
      data: {
        number: paymentNumber,
        direction: "pay",
        fromAccountId: paymentAccount.id,
        toAccountId: expenseAccount.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        amount: input.amount,
        paymentDate: input.expenseDate,
        createdById,
        notes: input.notes
      }
    });

    const journalLines = [
      {
        lineNo: 1,
        accountId: expenseAccount.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: input.amount,
        credit: 0,
        baseDebit: amountBase,
        baseCredit: 0,
        memo: input.description
      },
      {
        lineNo: 2,
        accountId: paymentAccount.id,
        currencyCode: input.currencyCode,
        exchangeRateToBase: input.exchangeRateToBase,
        debit: 0,
        credit: input.amount,
        baseDebit: 0,
        baseCredit: amountBase,
        memo: input.description
      }
    ];

    assertBalancedJournalLines(journalLines);

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.expenseDate,
        description: input.description,
        status: "posted",
        sourceType: "payment",
        sourceId: createdPayment.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines }
      }
    });

    await tx.payment.update({
      where: { id: createdPayment.id },
      data: { journalEntryId: journalEntry.id }
    });

    await updateAccountBalance(
      tx,
      expenseAccount.id,
      input.currencyCode,
      input.amount,
      0
    );
    await updateAccountBalance(
      tx,
      paymentAccount.id,
      input.currencyCode,
      0,
      input.amount
    );

    return tx.payment.findUniqueOrThrow({
      where: { id: createdPayment.id },
      include: {
        fromAccount: { select: { id: true, code: true, name: true, type: true } },
        toAccount: { select: { id: true, code: true, name: true, type: true } },
        journalEntry: {
          select: { id: true, number: true, description: true, entryDate: true }
        }
      }
    });
  });

  return { payment };
}

export async function recordFunding(
  input: RecordFundingInput,
  createdById?: string
) {
  return withTransaction(async (tx) => {
    const [assetAccount, equityAccount] = await Promise.all([
      tx.account.findUnique({ where: { id: input.assetAccountId } }),
      tx.account.findUnique({ where: { id: input.equityAccountId } })
    ]);
    if (!assetAccount?.isActive || assetAccount.category !== "asset" || !["cash", "bank", "sarafi", "daskhil"].includes(assetAccount.type)) {
      throw new AppError(400, "Funds must be added to an active cash, bank, sarafi, or daskhil asset account");
    }
    if (!equityAccount?.isActive || equityAccount.category !== "equity" || equityAccount.type !== "equity") {
      throw new AppError(400, "Funding source must be an active owner equity account");
    }
    if (assetAccount.currencyCode !== input.currencyCode || equityAccount.currencyCode !== input.currencyCode) {
      throw new AppError(400, "Asset, owner equity, and funding currencies must match");
    }
    const nativeLedgerRate = 1;
    const baseAmount = input.amount;
    const journalNumber = await nextEntityCode(tx, "journal");
    const lines = [
      { lineNo: 1, accountId: assetAccount.id, currencyCode: input.currencyCode, exchangeRateToBase: nativeLedgerRate, debit: input.amount, credit: 0, baseDebit: baseAmount, baseCredit: 0, memo: "Funds added to business account" },
      { lineNo: 2, accountId: equityAccount.id, currencyCode: input.currencyCode, exchangeRateToBase: nativeLedgerRate, debit: 0, credit: input.amount, baseDebit: 0, baseCredit: baseAmount, memo: "Owner funds contributed" }
    ];
    assertBalancedJournalLines(lines);
    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalNumber,
        entryDate: input.fundingDate,
        description: input.description,
        status: "posted",
        sourceType: input.isOpeningBalance ? "opening_balance" : "manual",
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: lines }
      },
      include: { lines: { include: { account: true } } }
    });
    await updateAccountBalance(tx, assetAccount.id, input.currencyCode, input.amount, 0);
    await updateAccountBalance(tx, equityAccount.id, input.currencyCode, 0, input.amount);
    return { journalEntry };
  });
}
