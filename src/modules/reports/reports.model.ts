import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  AccountBalancesQuery,
  AccountLedgerQuery,
  BalanceSheetQuery,
  DailyReportQuery,
  FinancialSummaryQuery,
  IncomeStatementQuery,
  InventoryBalancesQuery,
  JournalReportQuery,
  MonthlyReportQuery
} from "./reports.validation.js";

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextDay(date: Date) {
  const value = startOfDay(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function dateRange(from?: Date, to?: Date) {
  return {
    gte: from ? startOfDay(from) : undefined,
    lt: to ? nextDay(to) : undefined
  };
}

function decimalNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineBalance(
  normalBalance: "debit" | "credit",
  debit: unknown,
  credit: unknown
) {
  return normalBalance === "debit"
    ? decimalNumber(debit) - decimalNumber(credit)
    : decimalNumber(credit) - decimalNumber(debit);
}

function sumBase(rows: Array<{ _sum: { baseDebit?: unknown; baseCredit?: unknown } }>) {
  return rows.reduce(
    (totals, row) => ({
      debit: totals.debit + decimalNumber(row._sum.baseDebit),
      credit: totals.credit + decimalNumber(row._sum.baseCredit)
    }),
    { debit: 0, credit: 0 }
  );
}

async function accountStatementRows(
  categories: Array<"asset" | "liability" | "equity" | "revenue" | "expense">,
  journalEntry: Prisma.JournalEntryWhereInput
) {
  const rows = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry,
      account: { category: { in: categories } }
    },
    _sum: { baseDebit: true, baseCredit: true }
  });
  const accountIds = rows.map((row) => row.accountId);
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      category: true,
      normalBalance: true
    }
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return rows
    .map((row) => {
      const account = accountById.get(row.accountId);
      if (!account) return null;
      const debit = decimalNumber(row._sum.baseDebit);
      const credit = decimalNumber(row._sum.baseCredit);
      return {
        account,
        debit,
        credit,
        balance: lineBalance(account.normalBalance, debit, credit)
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => left.account.code.localeCompare(right.account.code));
}

async function nativeStatementRows(
  categories: Array<"asset" | "liability" | "equity" | "revenue" | "expense">,
  journalEntry: Prisma.JournalEntryWhereInput
) {
  const rows = await prisma.journalLine.groupBy({
    by: ["accountId", "currencyCode"],
    where: { journalEntry, account: { category: { in: categories } } },
    _sum: { debit: true, credit: true }
  });
  const accounts = await prisma.account.findMany({
    where: { id: { in: rows.map((row) => row.accountId) } },
    select: { id: true, code: true, name: true, type: true, category: true, normalBalance: true }
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return rows.flatMap((row) => {
    const account = accountById.get(row.accountId);
    if (!account) return [];
    const debit = decimalNumber(row._sum.debit);
    const credit = decimalNumber(row._sum.credit);
    return [{
      account,
      category: account.category,
      currencyCode: row.currencyCode,
      debit,
      credit,
      balance: lineBalance(account.normalBalance, debit, credit)
    }];
  });
}

function nativeTotalsByCurrency(
  rows: Array<{ category: string; currencyCode: string; balance: number }>,
  categories: string[]
) {
  const totals = new Map<string, number>();
  rows.filter((row) => categories.includes(row.category)).forEach((row) => {
    totals.set(row.currencyCode, (totals.get(row.currencyCode) ?? 0) + row.balance);
  });
  return [...totals.entries()].map(([currencyCode, total]) => ({ currencyCode, total }));
}

function sumStatementRows(rows: Array<{ balance: number }>) {
  return rows.reduce((sum, row) => sum + row.balance, 0);
}

async function journalTotals(where: Prisma.JournalLineWhereInput) {
  return prisma.journalLine.groupBy({
    by: ["currencyCode"],
    where,
    _sum: {
      debit: true,
      credit: true,
      baseDebit: true,
      baseCredit: true
    }
  });
}

export async function dailyReport(query: DailyReportQuery) {
  const date = query.date ? startOfDay(query.date) : startOfDay(new Date());
  const end = nextDay(date);
  const journalWhere: Prisma.JournalEntryWhereInput = {
    entryDate: { gte: date, lt: end },
    status: { in: ["posted", "reversed"] }
  };
  const [journals, totals, transfersCount] = await Promise.all([
    prisma.journalEntry.findMany({
      where: journalWhere,
      orderBy: { createdAt: "desc" },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
            partner: { select: { id: true, code: true, name: true } }
          }
        }
      }
    }),
    journalTotals({ journalEntry: journalWhere }),
    prisma.moneyTransfer.count({
      where: { transferDate: { gte: date, lt: end }, status: "posted" }
    })
  ]);

  return {
    date,
    summary: {
      journalCount: journals.length,
      transfersCount,
      totals
    },
    journals
  };
}

export async function monthlyReport(query: MonthlyReportQuery) {
  const { start, end } = monthRange(query.year, query.month);
  const journalWhere: Prisma.JournalEntryWhereInput = {
    entryDate: { gte: start, lt: end },
    status: { in: ["posted", "reversed"] }
  };
  const [journalCount, totals, transferCount, salesCount, purchaseCount] =
    await Promise.all([
      prisma.journalEntry.count({ where: journalWhere }),
      journalTotals({ journalEntry: journalWhere }),
      prisma.moneyTransfer.count({
        where: { transferDate: { gte: start, lt: end }, status: "posted" }
      }),
      prisma.salesInvoice.count({
        where: { invoiceDate: { gte: start, lt: end } }
      }),
      prisma.purchaseBill.count({
        where: { billDate: { gte: start, lt: end } }
      })
    ]);

  return {
    period: { year: query.year, month: query.month, start, end },
    summary: {
      journalCount,
      transferCount,
      salesCount,
      purchaseCount,
      totals
    }
  };
}

export async function accountLedger(query: AccountLedgerQuery) {
  const pagination = getPagination(query);
  const account = await prisma.account.findUnique({
    where: { id: query.accountId },
    select: { id: true, code: true, name: true, type: true, category: true, normalBalance: true, currencyCode: true }
  });
  if (!account) {
    return {
      data: [],
      account: null,
      summary: {
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0
      },
      pagination: {
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
      }
    };
  }

  const where: Prisma.JournalLineWhereInput = {
    accountId: query.accountId,
    journalEntry: {
      status: { in: ["posted", "reversed"] },
      entryDate: dateRange(query.from, query.to)
    }
  };
  const openingWhere: Prisma.JournalLineWhereInput = {
    accountId: query.accountId,
    journalEntry: {
      status: { in: ["posted", "reversed"] },
      entryDate: query.from ? { lt: startOfDay(query.from) } : undefined
    }
  };
  const [lines, total, openingCurrencyTotals, periodCurrencyTotals] = await Promise.all([
    prisma.journalLine.findMany({
      where,
      orderBy: [
        { journalEntry: { entryDate: "asc" } },
        { journalEntry: { number: "asc" } },
        { lineNo: "asc" }
      ],
      include: {
        journalEntry: true,
        account: { select: { id: true, code: true, name: true, normalBalance: true } },
        partner: { select: { id: true, code: true, name: true } }
      }
    }),
    prisma.journalLine.count({ where }),
    prisma.journalLine.groupBy({
      by: ["currencyCode"],
      where: openingWhere,
      _sum: { debit: true, credit: true }
    }),
    prisma.journalLine.groupBy({
      by: ["currencyCode"],
      where,
      _sum: { debit: true, credit: true }
    })
  ]);

  const openingByCurrency = new Map(
    openingCurrencyTotals.map((row) => [
      row.currencyCode,
      lineBalance(account.normalBalance, row._sum.debit, row._sum.credit)
    ])
  );
  const runningByCurrency = new Map(openingByCurrency);
  const ledgerLines = lines.map((line) => {
    const runningBalance =
      (runningByCurrency.get(line.currencyCode) ?? 0) +
      lineBalance(account.normalBalance, line.debit, line.credit);
    runningByCurrency.set(line.currencyCode, runningBalance);
    return {
      ...line,
      runningBalance
    };
  });
  const pageLines = ledgerLines.slice(pagination.skip, pagination.skip + pagination.take);

  const currencyTotals = periodCurrencyTotals.map((row) => ({
    currencyCode: row.currencyCode,
    debit: decimalNumber(row._sum.debit),
    credit: decimalNumber(row._sum.credit),
    openingBalance: openingByCurrency.get(row.currencyCode) ?? 0,
    closingBalance: runningByCurrency.get(row.currencyCode) ?? 0
  }));
  const primaryCurrency = account.currencyCode;
  const primaryTotals = currencyTotals.find((row) => row.currencyCode === primaryCurrency);

  return {
    ...paginatedResponse(pageLines, total, pagination.page, pagination.limit),
    account,
    summary: {
      openingBalance: primaryCurrency ? (openingByCurrency.get(primaryCurrency) ?? 0) : 0,
      totalDebit: primaryTotals?.debit ?? 0,
      totalCredit: primaryTotals?.credit ?? 0,
      currencyTotals,
      closingBalance: primaryCurrency ? (runningByCurrency.get(primaryCurrency) ?? 0) : 0
    }
  };
}

export async function journalReport(query: JournalReportQuery) {
  const pagination = getPagination(query);
  const lineFilters: Prisma.JournalLineWhereInput[] = [];
  if (query.accountId) lineFilters.push({ accountId: query.accountId });
  if (query.partnerId) lineFilters.push({ partnerId: query.partnerId });
  if (query.currencyCode) lineFilters.push({ currencyCode: query.currencyCode });

  const where: Prisma.JournalEntryWhereInput = {
    status: query.status,
    sourceType: query.sourceType,
    number: query.number ? { contains: query.number } : undefined,
    entryDate: dateRange(query.from, query.to),
    AND: lineFilters.map((filter) => ({ lines: { some: filter } }))
  };

  const [journals, total, currencyTotals] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { number: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        postedBy: { select: { id: true, fullName: true, username: true } },
        movements: {
          select: { id: true, number: true, type: true, reference: true }
        },
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true, category: true }
            },
            partner: { select: { id: true, code: true, name: true, type: true } }
          }
        }
      }
    }),
    prisma.journalEntry.count({ where }),
    prisma.journalLine.groupBy({
      by: ["currencyCode"],
      where: { journalEntry: where, AND: lineFilters },
      _sum: { debit: true, credit: true }
    })
  ]);

  return {
    ...paginatedResponse(journals, total, pagination.page, pagination.limit),
    summary: {
      currencyTotals: currencyTotals.map((row) => ({
        currencyCode: row.currencyCode,
        debit: decimalNumber(row._sum.debit),
        credit: decimalNumber(row._sum.credit)
      }))
    }
  };
}

async function partnerExposure(
  type: "accounts_receivable" | "accounts_payable",
  journalEntry: Prisma.JournalEntryWhereInput
) {
  const rows = await prisma.journalLine.groupBy({
    by: ["partnerId", "currencyCode"],
    where: {
      partnerId: { not: null },
      account: { type },
      journalEntry
    },
    _sum: { debit: true, credit: true, baseDebit: true, baseCredit: true }
  });
  const partnerIds = rows
    .map((row) => row.partnerId)
    .filter((id): id is string => Boolean(id));
  const partners = await prisma.partner.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, code: true, name: true, type: true }
  });
  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));

  return rows.map((row) => {
    const debit = decimalNumber(row._sum.debit);
    const credit = decimalNumber(row._sum.credit);
    return {
      partner: row.partnerId ? partnerById.get(row.partnerId) ?? null : null,
      currencyCode: row.currencyCode,
      debitTotal: debit,
      creditTotal: credit,
      balance: type === "accounts_receivable" ? debit - credit : credit - debit
    };
  });
}

export async function financialSummary(query: FinancialSummaryQuery) {
  const journalEntry: Prisma.JournalEntryWhereInput = {
    status: { in: ["posted", "reversed"] },
    entryDate: dateRange(query.from, query.to)
  };
  const [revenueRows, expenseRows, receivables, payables] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ["currencyCode"],
      where: { journalEntry, account: { category: "revenue" } },
      _sum: { baseDebit: true, baseCredit: true }
    }),
    prisma.journalLine.groupBy({
      by: ["currencyCode"],
      where: { journalEntry, account: { category: "expense" } },
      _sum: { baseDebit: true, baseCredit: true }
    }),
    partnerExposure("accounts_receivable", journalEntry),
    partnerExposure("accounts_payable", journalEntry)
  ]);

  const revenue = sumBase(revenueRows).credit - sumBase(revenueRows).debit;
  const expenses = sumBase(expenseRows).debit - sumBase(expenseRows).credit;
  const net = revenue - expenses;

  return {
    period: {
      from: query.from ? startOfDay(query.from) : null,
      to: query.to ? startOfDay(query.to) : null
    },
    profitLoss: {
      revenue,
      expenses,
      net,
      status: net >= 0 ? "profit" : "loss"
    },
    receivables: {
      total: receivables.reduce((sum, row) => sum + row.balance, 0),
      rows: receivables
    },
    payables: {
      total: payables.reduce((sum, row) => sum + row.balance, 0),
      rows: payables
    }
  };
}

export async function incomeStatement(query: IncomeStatementQuery) {
  const journalEntry: Prisma.JournalEntryWhereInput = {
    status: { in: ["posted", "reversed"] },
    entryDate: dateRange(query.from, query.to)
  };
  const [rows, nativeRows] = await Promise.all([
    accountStatementRows(["revenue", "expense"], journalEntry),
    nativeStatementRows(["revenue", "expense"], journalEntry)
  ]);
  const baseRevenue = rows.filter((row) => row.account.category === "revenue");
  const baseExpenses = rows.filter((row) => row.account.category === "expense");
  const revenue = nativeRows.filter((row) => row.category === "revenue");
  const expenses = nativeRows.filter((row) => row.category === "expense");
  const totalRevenue = sumStatementRows(baseRevenue);
  const totalExpenses = sumStatementRows(baseExpenses);
  const net = totalRevenue - totalExpenses;
  const nativeRevenue = new Map(
    nativeTotalsByCurrency(nativeRows, ["revenue"]).map((row) => [row.currencyCode, row.total])
  );
  const nativeExpenses = new Map(
    nativeTotalsByCurrency(nativeRows, ["expense"]).map((row) => [row.currencyCode, row.total])
  );
  const nativeCurrencies = new Set([...nativeRevenue.keys(), ...nativeExpenses.keys()]);

  return {
    period: {
      from: query.from ? startOfDay(query.from) : null,
      to: query.to ? startOfDay(query.to) : null
    },
    revenue,
    expenses,
    totals: {
      revenue: totalRevenue,
      expenses: totalExpenses,
      net,
      status: net >= 0 ? "profit" : "loss"
    },
    nativeTotals: [...nativeCurrencies].map((currencyCode) => {
      const revenue = nativeRevenue.get(currencyCode) ?? 0;
      const expenses = nativeExpenses.get(currencyCode) ?? 0;
      return { currencyCode, revenue, expenses, net: revenue - expenses };
    })
  };
}

export async function balanceSheet(query: BalanceSheetQuery) {
  const asOf = query.asOf ? startOfDay(query.asOf) : startOfDay(new Date());
  const journalEntry: Prisma.JournalEntryWhereInput = {
    status: { in: ["posted", "reversed"] },
    entryDate: { lt: nextDay(asOf) }
  };
  const [positionRows, performance, nativeRows] = await Promise.all([
    accountStatementRows(["asset", "liability", "equity"], journalEntry),
    incomeStatement({ to: asOf }),
    nativeStatementRows(["asset", "liability", "equity", "revenue", "expense"], journalEntry)
  ]);
  const assets = positionRows.filter((row) => row.account.category === "asset");
  const liabilities = positionRows.filter(
    (row) => row.account.category === "liability"
  );
  const equityAccounts = positionRows.filter(
    (row) => row.account.category === "equity"
  );
  const totalAssets = sumStatementRows(assets);
  const totalLiabilities = sumStatementRows(liabilities);
  const currentProfitLoss = Number(performance.totals.net);
  const totalEquity = sumStatementRows(equityAccounts) + currentProfitLoss;
  const liabilitiesAndEquity = totalLiabilities + totalEquity;
  const nativeAssets = nativeTotalsByCurrency(nativeRows, ["asset"]);
  const nativeLiabilities = nativeTotalsByCurrency(nativeRows, ["liability"]);
  const nativeEquityAccounts = nativeTotalsByCurrency(nativeRows, ["equity"]);
  const nativeRevenue = new Map(nativeTotalsByCurrency(nativeRows, ["revenue"]).map((row) => [row.currencyCode, row.total]));
  const nativeExpenses = new Map(nativeTotalsByCurrency(nativeRows, ["expense"]).map((row) => [row.currencyCode, row.total]));
  const currencies = new Set([
    ...nativeAssets.map((row) => row.currencyCode),
    ...nativeLiabilities.map((row) => row.currencyCode),
    ...nativeEquityAccounts.map((row) => row.currencyCode),
    ...nativeRevenue.keys(),
    ...nativeExpenses.keys()
  ]);
  const valueMap = (rows: Array<{ currencyCode: string; total: number }>) =>
    new Map(rows.map((row) => [row.currencyCode, row.total]));
  const assetMap = valueMap(nativeAssets);
  const liabilityMap = valueMap(nativeLiabilities);
  const equityMap = valueMap(nativeEquityAccounts);
  const nativeTotals = [...currencies].map((currencyCode) => {
    const assets = assetMap.get(currencyCode) ?? 0;
    const liabilities = liabilityMap.get(currencyCode) ?? 0;
    const equity = (equityMap.get(currencyCode) ?? 0) +
      (nativeRevenue.get(currencyCode) ?? 0) - (nativeExpenses.get(currencyCode) ?? 0);
    // A native currency position is informative, but a cross-currency journal
    // does not necessarily balance inside each currency. Only the consolidated
    // base-currency statement is an accounting equation.
    const crossCurrencyPosition = assets - liabilities - equity;
    const liabilitiesAndEquity = liabilities + equity;
    const difference = assets - liabilitiesAndEquity;
    return {
      currencyCode,
      assets,
      liabilities,
      equity,
      crossCurrencyPosition,
      liabilitiesAndEquity,
      difference,
      balanced: Math.abs(difference) < 0.01
    };
  });

  return {
    asOf,
    assets,
    liabilities,
    equity: {
      accounts: equityAccounts,
      currentProfitLoss,
      total: totalEquity
    },
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equity: totalEquity,
      liabilitiesAndEquity,
      difference: totalAssets - liabilitiesAndEquity,
      balanced: Math.abs(totalAssets - liabilitiesAndEquity) < 0.01
    },
    nativeTotals
  };
}

export async function accountBalances(query: AccountBalancesQuery) {
  const pagination = getPagination(query);
  const where: Prisma.AccountBalanceWhereInput = {
    currencyCode: query.currencyCode
  };
  const [balances, total] = await Promise.all([
    prisma.accountBalance.findMany({
      where,
      orderBy: [{ account: { code: "asc" } }, { currencyCode: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        account: { select: { id: true, code: true, name: true, type: true, category: true } },
        currency: true
      }
    }),
    prisma.accountBalance.count({ where })
  ]);

  return paginatedResponse(balances, total, pagination.page, pagination.limit);
}

export async function cashBalances() {
  const balances = await prisma.accountBalance.findMany({
    where: {
      account: {
        type: { in: ["cash", "bank", "sarafi", "daskhil"] }
      }
    },
    orderBy: [{ account: { code: "asc" } }, { currencyCode: "asc" }],
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      currency: true
    }
  });

  return { balances };
}

export async function inventoryBalances(query: InventoryBalancesQuery) {
  const pagination = getPagination(query);
  const where: Prisma.InventoryBalanceWhereInput = {
    productId: query.productId,
    locationId: query.locationId
  };
  const [balances, total] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where,
      orderBy: [{ product: { sku: "asc" } }, { location: { code: "asc" } }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            reorderLevel: true,
            standardCost: true,
            preferredPurchaseCurrency: true
          }
        },
        location: true
      }
    }),
    prisma.inventoryBalance.count({ where })
  ]);

  const rows = balances.map((balance) => {
    const quantityOnHand = balance.quantity;
    const averageCost = balance.product.standardCost;
    const inventoryValue =
      Number(balance.quantity ?? 0) * Number(balance.product.standardCost ?? 0);

    return {
      id: balance.id,
      currencyCode: balance.product.preferredPurchaseCurrency,
      product: balance.product,
      location: balance.location,
      quantityOnHand,
      averageCost,
      inventoryValue
    };
  });

  return paginatedResponse(rows, total, pagination.page, pagination.limit);
}
