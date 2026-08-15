import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import {
  assertBalancedJournalLines,
  updateAccountBalance
} from "../../utils/accounting.js";
import { AppError } from "../../utils/app-error.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreateTransferInput,
  ListTransfersQuery
} from "./transfers.validation.js";

const transferInclude = {
  fromAccount: { select: { id: true, code: true, name: true, type: true } },
  toAccount: { select: { id: true, code: true, name: true, type: true } },
  currency: true,
  journalEntry: {
    include: {
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true } }
        }
      }
    }
  },
  createdBy: { select: { id: true, fullName: true, username: true } }
} satisfies Prisma.MoneyTransferInclude;

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextDay(date: Date) {
  const value = startOfDay(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

export async function listTransfers(query: ListTransfersQuery) {
  const pagination = getPagination(query);
  const where: Prisma.MoneyTransferWhereInput = {
    status: query.status,
    transferDate: {
      gte: query.from ? startOfDay(query.from) : undefined,
      lt: query.to ? nextDay(query.to) : undefined
    }
  };

  const [transfers, total] = await Promise.all([
    prisma.moneyTransfer.findMany({
      where,
      orderBy: { transferDate: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: transferInclude
    }),
    prisma.moneyTransfer.count({ where })
  ]);

  return paginatedResponse(transfers, total, pagination.page, pagination.limit);
}

export async function getTransfer(transferId: string) {
  const transfer = await prisma.moneyTransfer.findUnique({
    where: { id: transferId },
    include: transferInclude
  });

  if (!transfer) {
    throw new AppError(404, "Transfer not found");
  }

  return { transfer };
}

export async function getTransferByNumber(number: string) {
  const transfer = await prisma.moneyTransfer.findUnique({
    where: { number },
    include: transferInclude
  });

  if (!transfer) {
    throw new AppError(404, "Transfer not found");
  }

  return { transfer };
}

export async function createTransfer(
  input: CreateTransferInput,
  createdById?: string
) {
  const transfer = await withTransaction(async (tx) => {
    const [fromAccount, toAccount] = await Promise.all([
      tx.account.findUnique({
        where: { id: input.fromAccountId },
        select: { id: true, isActive: true, currencyCode: true, category: true, type: true, normalBalance: true, balances: true }
      }),
      tx.account.findUnique({
        where: { id: input.toAccountId },
        select: { id: true, isActive: true, currencyCode: true, category: true, type: true, normalBalance: true }
      })
    ]);

    if (!fromAccount?.isActive || !toAccount?.isActive) {
      throw new AppError(400, "Both transfer accounts must exist and be active");
    }
    if (!fromAccount.currencyCode || !toAccount.currencyCode) throw new AppError(400, "Both transfer accounts must have a currency");
    const transferableTypes = ["cash", "bank", "sarafi", "daskhil"];
    if (fromAccount.category !== "asset" || !transferableTypes.includes(fromAccount.type)) {
      throw new AppError(400, "Money can only be transferred from a cash, bank, sarafi, or daskhil account");
    }
    if (toAccount.category !== "asset" || toAccount.normalBalance !== "debit" || !transferableTypes.includes(toAccount.type)) {
      throw new AppError(400, "Money can only be received by a cash, bank, sarafi, or daskhil account");
    }
    if (input.currencyCode !== fromAccount.currencyCode) {
      throw new AppError(400, "Transfer currency must match the selected accounts");
    }
    if (fromAccount.normalBalance !== "debit") {
      throw new AppError(400, "Money can only be transferred from an asset account with an available balance");
    }
    const availableBalance = Number(
      fromAccount.balances.find((balance) => balance.currencyCode === input.currencyCode)?.balance ?? 0
    );
    if (input.amount > availableBalance) {
      throw new AppError(
        400,
        `Transfer amount exceeds the available balance of ${availableBalance} ${input.currencyCode}`
      );
    }

    const destinationCurrencyCode = toAccount.currencyCode;
    if (input.destinationCurrencyCode && input.destinationCurrencyCode !== destinationCurrencyCode) {
      throw new AppError(400, "Destination currency must match the receiving account");
    }
    const isExchange = destinationCurrencyCode !== input.currencyCode;
    const destinationAmount = isExchange ? Number(input.destinationAmount) : input.amount;
    if (!(destinationAmount > 0)) throw new AppError(400, "Received amount must be greater than zero");
    const conversionRate = isExchange ? Number(input.conversionRate) : 1;
    if (!(conversionRate > 0) || Math.abs(destinationAmount - input.amount * conversionRate) > 0.02) {
      throw new AppError(400, "Received amount must equal the sent amount multiplied by the exchange rate");
    }
    // A direct exchange supplies its own valuation. No unrelated global base-rate lookup is needed.
    const sourceRate = 1;
    const destinationRate = input.amount / destinationAmount;
    const baseAmount = input.amount;

    const transferCode = await nextEntityCode(tx, "transfer");
    const journalCode = await nextEntityCode(tx, "journal");
    const journalLines = [
      {
        lineNo: 1,
        accountId: input.toAccountId,
        currencyCode: destinationCurrencyCode,
        exchangeRateToBase: destinationRate,
        debit: destinationAmount,
        credit: 0,
        baseDebit: baseAmount,
        baseCredit: 0,
        memo: "Transfer received"
      },
      {
        lineNo: 2,
        accountId: input.fromAccountId,
        currencyCode: input.currencyCode,
        exchangeRateToBase: sourceRate,
        debit: 0,
        credit: input.amount,
        baseDebit: 0,
        baseCredit: baseAmount,
        memo: "Transfer sent"
      }
    ];

    assertBalancedJournalLines(journalLines);

    const createdTransfer = await tx.moneyTransfer.create({
      data: {
        number: transferCode,
        status: "posted",
        transferDate: input.transferDate,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        currencyCode: input.currencyCode,
        destinationCurrencyCode,
        destinationAmount,
        conversionRate,
        exchangeRateToBase: sourceRate,
        amount: input.amount,
        feeAmount: input.feeAmount,
        reference: `Internal transfer ${transferCode}`,
        notes: input.notes,
        createdById
      }
    });

    const journalEntry = await tx.journalEntry.create({
      data: {
        number: journalCode,
        entryDate: input.transferDate,
        description: input.notes ?? `Money transfer ${createdTransfer.number}`,
        status: "posted",
        sourceType: "money_transfer",
        sourceId: createdTransfer.id,
        createdById,
        postedById: createdById,
        postedAt: new Date(),
        lines: { create: journalLines }
      }
    });

    await tx.moneyTransfer.update({
      where: { id: createdTransfer.id },
      data: { journalEntryId: journalEntry.id }
    });

    await updateAccountBalance(
      tx,
      input.toAccountId,
      destinationCurrencyCode,
      destinationAmount,
      0
    );
    await updateAccountBalance(
      tx,
      input.fromAccountId,
      input.currencyCode,
      0,
      input.amount
    );

    return tx.moneyTransfer.findUniqueOrThrow({
      where: { id: createdTransfer.id },
      include: transferInclude
    });
  });

  return { transfer };
}
