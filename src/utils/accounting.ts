import type { PrismaTransaction } from "../db/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  AccountType,
  CurrencyCode,
  PartnerLedgerAccountType,
} from "../generated/prisma/client.js";
import { AppError } from "./app-error.js";

type JournalLineAmount = {
  currencyCode: CurrencyCode;
  exchangeRateToBase: number;
  debit: number;
  credit: number;
  baseDebit: number;
  baseCredit: number;
};

const ledgerTypeRules = {
  receivable: {
    accountType: "accounts_receivable",
    partnerTypes: ["customer", "both", "sarafi", "staff"],
  },
  payable: {
    accountType: "accounts_payable",
    partnerTypes: ["vendor", "both", "sarafi", "staff"],
  },
} as const;

function cents(value: number) {
  return Math.round(Number(value ?? 0) * 100);
}

function assertLedgerType(
  type: PartnerLedgerAccountType,
): asserts type is keyof typeof ledgerTypeRules {
  if (!(type in ledgerTypeRules)) {
    throw new AppError(
      400,
      `Unsupported automatic partner ledger type: ${type}`,
    );
  }
}

export function assertBalancedJournalLines(lines: JournalLineAmount[]) {
  if (lines.length < 2) {
    throw new AppError(400, "A posted journal entry needs at least two lines");
  }

  const baseDebit = lines.reduce((sum, line) => sum + cents(line.baseDebit), 0);
  const baseCredit = lines.reduce(
    (sum, line) => sum + cents(line.baseCredit),
    0,
  );
  if (baseDebit !== baseCredit) {
    throw new AppError(400, "Journal entry is not balanced in base currency");
  }

  for (const line of lines) {
    const amounts = [line.debit, line.credit, line.baseDebit, line.baseCredit, line.exchangeRateToBase];
    if (amounts.some((amount) => !Number.isFinite(Number(amount)))) {
      throw new AppError(400, "Journal amounts and exchange rates must be finite numbers");
    }
    if (line.exchangeRateToBase <= 0 || line.debit < 0 || line.credit < 0 || line.baseDebit < 0 || line.baseCredit < 0) {
      throw new AppError(400, "Journal amounts cannot be negative and exchange rates must be positive");
    }
    const hasDebit = cents(line.debit) > 0;
    const hasCredit = cents(line.credit) > 0;
    if (hasDebit === hasCredit) {
      throw new AppError(
        400,
        "A journal line must contain either a debit or a credit, but not both",
      );
    }
    if (hasDebit && (cents(line.baseCredit) !== 0 || cents(line.baseDebit) !== cents(line.debit * line.exchangeRateToBase))) {
      throw new AppError(400, "Journal debit does not match its exchange rate and base debit");
    }
    if (hasCredit && (cents(line.baseDebit) !== 0 || cents(line.baseCredit) !== cents(line.credit * line.exchangeRateToBase))) {
      throw new AppError(400, "Journal credit does not match its exchange rate and base credit");
    }
  }
}

export async function getOrCreatePartnerLedgerAccount(
  tx: PrismaTransaction,
  partnerId: string,
  currencyCode: CurrencyCode,
  type: PartnerLedgerAccountType,
) {
  assertLedgerType(type);
  const rule = ledgerTypeRules[type];
  const partner = await tx.partner.findUnique({
    where: { id: partnerId },
    include: {
      ledgerAccounts: {
        where: { currencyCode, type },
        include: { account: true },
        orderBy: { isDefault: "desc" },
      },
    },
  });

  if (!partner?.isActive) {
    throw new AppError(400, "Partner must be active for this transaction");
  }

  if (!(rule.partnerTypes as readonly string[]).includes(partner.type)) {
    throw new AppError(400, `Partner cannot use ${type} ledger accounts`);
  }

  const existingLedger = partner.ledgerAccounts[0];
  if (existingLedger) {
    if (
      existingLedger.account.currencyCode === currencyCode &&
      existingLedger.account.type === rule.accountType &&
      existingLedger.account.isActive
    ) {
      return { partner, ledger: existingLedger };
    }

    const currencyAccount = await resolveAccountByType(
      tx,
      undefined,
      rule.accountType,
      currencyCode,
    );
    await tx.journalLine.updateMany({
      where: {
        accountId: existingLedger.accountId,
        partnerId: partner.id,
        currencyCode,
      },
      data: { accountId: currencyAccount.id },
    });

    for (const affectedAccount of [existingLedger.account, currencyAccount]) {
      const totals = await tx.journalLine.aggregate({
        where: {
          accountId: affectedAccount.id,
          currencyCode,
          journalEntry: { status: { in: ["posted", "reversed"] } },
        },
        _sum: { debit: true, credit: true },
      });
      const debitTotal = Number(totals._sum.debit ?? 0);
      const creditTotal = Number(totals._sum.credit ?? 0);
      const balance =
        affectedAccount.normalBalance === "debit"
          ? debitTotal - creditTotal
          : creditTotal - debitTotal;
      await tx.accountBalance.upsert({
        where: {
          accountId_currencyCode: {
            accountId: affectedAccount.id,
            currencyCode,
          },
        },
        create: {
          accountId: affectedAccount.id,
          currencyCode,
          debitTotal,
          creditTotal,
          balance,
        },
        update: { debitTotal, creditTotal, balance },
      });
    }

    const ledger = await tx.partnerLedgerAccount.update({
      where: { id: existingLedger.id },
      data: { accountId: currencyAccount.id },
      include: { account: true },
    });
    return { partner, ledger };
  }

  const accountField =
    type === "receivable" ? "receivableAccountId" : "payableAccountId";
  let accountId = partner[accountField];

  if (accountId) {
    const configuredAccount = await tx.account.findUnique({ where: { id: accountId } });
    if (
      !configuredAccount?.isActive ||
      configuredAccount.type !== rule.accountType ||
      configuredAccount.currencyCode !== currencyCode
    ) {
      accountId = null;
    }
  }

  if (!accountId) {
    const controlAccount = await resolveAccountByType(
      tx,
      undefined,
      rule.accountType,
      currencyCode,
    );

    accountId = controlAccount.id;
    if (!partner[accountField]) {
      await tx.partner.update({
        where: { id: partner.id },
        data: { [accountField]: accountId },
      });
    }
  }

  const siblingCount = await tx.partnerLedgerAccount.count({
    where: { partnerId: partner.id, type },
  });

  try {
    const ledger = await tx.partnerLedgerAccount.create({
      data: {
        partnerId: partner.id,
        accountId,
        currencyCode,
        type,
        isDefault: siblingCount === 0,
      },
      include: { account: true },
    });

    return { partner, ledger };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const ledger = await tx.partnerLedgerAccount.findUniqueOrThrow({
        where: {
          partnerId_currencyCode_type: {
            partnerId: partner.id,
            currencyCode,
            type,
          },
        },
        include: { account: true },
      });
      return { partner, ledger };
    }

    throw error;
  }
}

export async function resolveAccountByType(
  tx: PrismaTransaction,
  accountId: string | undefined,
  type: AccountType,
  currencyCode?: CurrencyCode,
) {
  if (accountId) {
    const account = await tx.account.findUnique({
      where: { id: accountId },
    });

    if (!account?.isActive || account.type !== type) {
      throw new AppError(
        400,
        `${type.replaceAll("_", " ")} account must exist and be active`,
      );
    }

    if (
      currencyCode &&
      account.currencyCode &&
      account.currencyCode !== currencyCode
    ) {
      throw new AppError(
        400,
        "Selected account currency does not match transaction currency",
      );
    }

    return account;
  }

  const exactCurrencyAccount = currencyCode
    ? await tx.account.findFirst({
        where: { type, currencyCode, isActive: true },
        orderBy: { code: "asc" },
      })
    : null;

  if (exactCurrencyAccount) return exactCurrencyAccount;

  const account = await tx.account.findFirst({
    where: { type, currencyCode: null, isActive: true },
    orderBy: { code: "asc" },
  });

  if (!account) {
    throw new AppError(
      400,
      `No active ${type.replaceAll("_", " ")} account is configured`,
    );
  }

  return account;
}

export async function resolvePaymentAccount(
  tx: PrismaTransaction,
  accountId: string | undefined,
  currencyCode: CurrencyCode,
  requiredAmount?: number,
) {
  const paymentTypes: AccountType[] = ["cash", "daskhil", "bank", "sarafi"];

  if (accountId) {
    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account?.isActive || !paymentTypes.includes(account.type)) {
      throw new AppError(
        400,
        "Payment account must be cash, daskhil, bank, or sarafi",
      );
    }

    if (account.currencyCode && account.currencyCode !== currencyCode) {
      throw new AppError(
        400,
        "Selected payment account currency does not match transaction currency",
      );
    }

    if (requiredAmount && requiredAmount > 0) {
      await ensureAccountCanCoverCredit(
        tx,
        account.id,
        currencyCode,
        requiredAmount,
      );
    }

    return account;
  }

  for (const type of paymentTypes) {
    const account = await tx.account.findFirst({
      where: { type, currencyCode, isActive: true },
      orderBy: { code: "asc" },
    });
    if (account) {
      if (requiredAmount && requiredAmount > 0) {
        const canCover = await accountCanCoverCredit(
          tx,
          account.id,
          currencyCode,
          requiredAmount,
        );
        if (!canCover) continue;
      }
      return account;
    }
  }

  for (const type of paymentTypes) {
    const account = await tx.account.findFirst({
      where: { type, currencyCode: null, isActive: true },
      orderBy: { code: "asc" },
    });
    if (account) {
      if (requiredAmount && requiredAmount > 0) {
        const canCover = await accountCanCoverCredit(
          tx,
          account.id,
          currencyCode,
          requiredAmount,
        );
        if (!canCover) continue;
      }
      return account;
    }
  }

  if (requiredAmount && requiredAmount > 0) {
    throw new AppError(
      400,
      "No payment account has enough available balance for this amount. Reduce the payment or leave the remainder as payable.",
    );
  }

  throw new AppError(
    400,
    "No active payment account is configured for this currency",
  );
}

export async function updateAccountBalance(
  tx: PrismaTransaction,
  accountId: string,
  currencyCode: CurrencyCode,
  debit: number,
  credit: number,
) {
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { normalBalance: true, type: true, code: true, currencyCode: true },
  });
  if (account.currencyCode && account.currencyCode !== currencyCode) {
    throw new AppError(
      400,
      `Account ${account.code} uses ${account.currencyCode} and cannot receive a ${currencyCode} posting`,
    );
  }
  const existing = await tx.accountBalance.findUnique({
    where: {
      accountId_currencyCode: {
        accountId,
        currencyCode,
      },
    },
  });
  const debitTotal = Number(existing?.debitTotal ?? 0) + debit;
  const creditTotal = Number(existing?.creditTotal ?? 0) + credit;
  const balance =
    account.normalBalance === "debit"
      ? debitTotal - creditTotal
      : creditTotal - debitTotal;

  if (account.type === "inventory" && balance < -0.005) {
    throw new AppError(
      400,
      `Inventory account ${account.code} does not have enough value in ${currencyCode}. Record the purchase or opening inventory value before selling this stock.`,
    );
  }

  await tx.accountBalance.upsert({
    where: {
      accountId_currencyCode: {
        accountId,
        currencyCode,
      },
    },
    create: {
      accountId,
      currencyCode,
      debitTotal,
      creditTotal,
      balance,
    },
    update: {
      debitTotal,
      creditTotal,
      balance,
    },
  });
}

export async function resolveRateToBase(
  tx: PrismaTransaction,
  currencyCode: CurrencyCode,
  effectiveAt: Date,
) {
  const base = await tx.currency.findFirst({
    where: { isBase: true, isActive: true },
    select: { code: true },
  });
  if (!base) throw new AppError(400, "No active base currency is configured");
  if (base.code === currencyCode) return 1;

  const direct = await tx.exchangeRate.findFirst({
    where: {
      fromCurrency: currencyCode,
      toCurrency: base.code,
      effectiveAt: { lte: effectiveAt },
    },
    orderBy: { effectiveAt: "desc" },
  });
  if (direct) return Number(direct.rate);

  const inverse = await tx.exchangeRate.findFirst({
    where: {
      fromCurrency: base.code,
      toCurrency: currencyCode,
      effectiveAt: { lte: effectiveAt },
    },
    orderBy: { effectiveAt: "desc" },
  });
  if (inverse) return 1 / Number(inverse.rate);

  throw new AppError(
    400,
    `No exchange rate is configured from ${currencyCode} to ${base.code}`,
  );
}

export async function assertValidTransactionRate(
  tx: PrismaTransaction,
  currencyCode: CurrencyCode,
  exchangeRateToBase: number,
) {
  const [currency, base] = await Promise.all([
    tx.currency.findUnique({ where: { code: currencyCode }, select: { isActive: true } }),
    tx.currency.findFirst({ where: { isBase: true, isActive: true }, select: { code: true } }),
  ]);
  if (!currency?.isActive) throw new AppError(400, `${currencyCode} is not an active currency`);
  if (!base) throw new AppError(400, "No active base currency is configured");
  if (base.code === currencyCode && Math.abs(exchangeRateToBase - 1) > 0.00000001) {
    throw new AppError(400, `The base currency ${currencyCode} must use an exchange rate of 1`);
  }
}

export async function resolveBaseCurrencyAccount(
  tx: PrismaTransaction,
  type: "exchange_gain" | "exchange_loss",
) {
  const base = await tx.currency.findFirst({
    where: { isBase: true, isActive: true },
    select: { code: true },
  });
  if (!base) throw new AppError(400, "No active base currency is configured");
  const account = await resolveAccountByType(tx, undefined, type, base.code);
  return { account, currencyCode: base.code };
}

async function accountCanCoverCredit(
  tx: PrismaTransaction,
  accountId: string,
  currencyCode: CurrencyCode,
  creditAmount: number,
) {
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: {
      category: true,
      normalBalance: true,
    },
  });

  if (account.category !== "asset" || account.normalBalance !== "debit") {
    return true;
  }

  const existing = await tx.accountBalance.findUnique({
    where: {
      accountId_currencyCode: {
        accountId,
        currencyCode,
      },
    },
    select: {
      balance: true,
    },
  });

  return Number(existing?.balance ?? 0) >= creditAmount;
}

export async function ensureAccountCanCoverCredit(
  tx: PrismaTransaction,
  accountId: string,
  currencyCode: CurrencyCode,
  creditAmount: number,
) {
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: {
      code: true,
      name: true,
      category: true,
      normalBalance: true,
    },
  });

  if (account.category !== "asset" || account.normalBalance !== "debit") {
    return;
  }

  const existing = await tx.accountBalance.findUnique({
    where: {
      accountId_currencyCode: {
        accountId,
        currencyCode,
      },
    },
    select: {
      balance: true,
    },
  });

  const availableBalance = Number(existing?.balance ?? 0);
  if (availableBalance < creditAmount) {
    throw new AppError(
      400,
      `${account.code} ${account.name} does not have enough balance for this payment. Available balance: ${availableBalance} ${currencyCode}. Reduce the payment or keep the remainder in accounts payable.`,
    );
  }
}

export async function increaseInventoryBalance(
  tx: PrismaTransaction,
  productId: string,
  locationId: string,
  quantity: number,
) {
  const existing = await tx.inventoryBalance.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
  });

  await tx.inventoryBalance.upsert({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
    create: {
      productId,
      locationId,
      quantity,
    },
    update: {
      quantity: Number(existing?.quantity ?? 0) + quantity,
    },
  });
}

export async function decreaseInventoryBalance(
  tx: PrismaTransaction,
  productId: string,
  locationId: string,
  quantity: number,
) {
  const existing = await tx.inventoryBalance.findUnique({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
  });
  const currentQuantity = Number(existing?.quantity ?? 0);

  if (currentQuantity < quantity) {
    throw new AppError(400, "Not enough inventory quantity for this sale");
  }

  await tx.inventoryBalance.upsert({
    where: {
      productId_locationId: {
        productId,
        locationId,
      },
    },
    create: {
      productId,
      locationId,
      quantity: 0,
    },
    update: {
      quantity: currentQuantity - quantity,
    },
  });
}
