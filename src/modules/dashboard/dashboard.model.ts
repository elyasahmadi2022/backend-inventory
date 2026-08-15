import { prisma } from "../../db/prisma.js";
import type { AdminDashboardQuery } from "./dashboard.validation.js";

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addCurrencyTotal(
  totals: Record<string, number>,
  currencyCode: string,
  amount: unknown
) {
  totals[currencyCode] = (totals[currencyCode] ?? 0) + numberValue(amount);
}

function totalsArray(totals: Record<string, number>) {
  return Object.entries(totals)
    .map(([currencyCode, total]) => ({ currencyCode, total }))
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode));
}

function netJournalTotals(
  lines: Array<{
    account: { id: string };
    currencyCode: string;
    debit: number;
    credit: number;
  }>,
) {
  const accountTotals = new Map<string, { currencyCode: string; net: number }>();
  for (const line of lines) {
    const key = `${line.currencyCode}:${line.account.id}`;
    const current = accountTotals.get(key) ?? {
      currencyCode: line.currencyCode,
      net: 0,
    };
    current.net += line.debit - line.credit;
    accountTotals.set(key, current);
  }

  const currencyTotals = new Map<string, { debit: number; credit: number }>();
  for (const item of accountTotals.values()) {
    const current = currencyTotals.get(item.currencyCode) ?? { debit: 0, credit: 0 };
    if (item.net > 0) current.debit += item.net;
    if (item.net < 0) current.credit += Math.abs(item.net);
    currencyTotals.set(item.currencyCode, current);
  }

  return [...currencyTotals.entries()].map(([currencyCode, totals]) => ({
    currencyCode,
    debit: totals.debit,
    credit: totals.credit,
  }));
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function nextUtcDay(value: Date) {
  const next = startOfUtcDay(value);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function daysAgo(days: number) {
  const date = startOfUtcDay(new Date());
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

export async function adminDashboard(query: AdminDashboardQuery = {}) {
  const ledgerFrom = query.from ? startOfUtcDay(query.from) : daysAgo(29);
  const ledgerTo = query.to ? nextUtcDay(query.to) : nextUtcDay(new Date());

  const [
    users,
    accounts,
    balances,
    partners,
    partnerLedgerAccounts,
    products,
    inventoryBalances,
    journalEntries,
    journalLines,
    recentJournals,
    salesInvoices,
    purchaseBills,
    payments,
    transfers
  ] = await Promise.all([
    prisma.user.count(),
    prisma.account.findMany({
      select: {
        id: true,
        category: true,
        type: true,
        isActive: true
      }
    }),
    prisma.accountBalance.findMany({
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
            type: true
          }
        }
      }
    }),
    prisma.partner.findMany({ select: { id: true, type: true, isActive: true } }),
    prisma.partnerLedgerAccount.count(),
    prisma.product.findMany({
      select: { id: true, isActive: true, reorderLevel: true }
    }),
    prisma.inventoryBalance.findMany({
      include: { product: { select: { id: true, reorderLevel: true, standardCost: true } } }
    }),
    prisma.journalEntry.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.journalLine.count(),
    prisma.journalEntry.findMany({
      where: {
        status: { in: ["posted", "reversed"] },
        entryDate: {
          gte: ledgerFrom,
          lt: ledgerTo
        }
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        lines: {
          orderBy: { lineNo: "asc" },
          include: {
            account: { select: { id: true, code: true, name: true, type: true } },
            partner: { select: { id: true, code: true, name: true } }
          }
        }
      }
    }),
    prisma.salesInvoice.findMany({
      select: { id: true, status: true, currencyCode: true, total: true, paidTotal: true }
    }),
    prisma.purchaseBill.findMany({
      select: { id: true, status: true, currencyCode: true, total: true, paidTotal: true }
    }),
    prisma.payment.findMany({
      select: { id: true, direction: true, currencyCode: true, amount: true }
    }),
    prisma.moneyTransfer.findMany({
      select: { id: true, status: true, currencyCode: true, amount: true }
    })
  ]);

  const accountCounts = {
    total: accounts.length,
    active: accounts.filter((account) => account.isActive).length,
    assets: accounts.filter((account) => account.category === "asset").length,
    liabilities: accounts.filter((account) => account.category === "liability").length,
    equity: accounts.filter((account) => account.category === "equity").length,
    revenue: accounts.filter((account) => account.category === "revenue").length,
    expenses: accounts.filter((account) => account.category === "expense").length,
    cash: accounts.filter((account) =>
      ["cash", "bank", "sarafi", "daskhil"].includes(account.type)
    ).length
  };

  const categoryTotals: Record<string, Record<string, number>> = {
    asset: {},
    liability: {},
    equity: {},
    revenue: {},
    expense: {}
  };
  const cashTotals: Record<string, number> = {};

  for (const balance of balances) {
    addCurrencyTotal(
      categoryTotals[balance.account.category],
      balance.currencyCode,
      balance.balance
    );
    if (["cash", "bank", "sarafi", "daskhil"].includes(balance.account.type)) {
      addCurrencyTotal(cashTotals, balance.currencyCode, balance.balance);
    }
  }

  const partnersByType = partners.reduce<Record<string, number>>((result, partner) => {
    result[partner.type] = (result[partner.type] ?? 0) + 1;
    return result;
  }, {});

  const inventoryByProduct = new Map<string, { quantity: number; reorderLevel: number }>();
  let inventoryCostValue = 0;
  for (const row of inventoryBalances) {
    const current = inventoryByProduct.get(row.productId) ?? {
      quantity: 0,
      reorderLevel: numberValue(row.product.reorderLevel)
    };
    const quantity = numberValue(row.quantity);
    current.quantity += quantity;
    inventoryCostValue += quantity * numberValue(row.product.standardCost);
    inventoryByProduct.set(row.productId, current);
  }

  const lowStockProducts = [...inventoryByProduct.values()].filter(
    (row) => row.reorderLevel > 0 && row.quantity <= row.reorderLevel
  ).length;

  const salesTotals: Record<string, number> = {};
  const salesOutstanding: Record<string, number> = {};
  for (const invoice of salesInvoices) {
    addCurrencyTotal(salesTotals, invoice.currencyCode, invoice.total);
    addCurrencyTotal(
      salesOutstanding,
      invoice.currencyCode,
      numberValue(invoice.total) - numberValue(invoice.paidTotal)
    );
  }

  const purchaseTotals: Record<string, number> = {};
  const purchaseOutstanding: Record<string, number> = {};
  for (const bill of purchaseBills) {
    addCurrencyTotal(purchaseTotals, bill.currencyCode, bill.total);
    addCurrencyTotal(
      purchaseOutstanding,
      bill.currencyCode,
      numberValue(bill.total) - numberValue(bill.paidTotal)
    );
  }

  const paymentTotals: Record<string, number> = {};
  for (const payment of payments) {
    addCurrencyTotal(paymentTotals, payment.currencyCode, payment.amount);
  }

  const transferTotals: Record<string, number> = {};
  for (const transfer of transfers) {
    addCurrencyTotal(transferTotals, transfer.currencyCode, transfer.amount);
  }

  return {
    generatedAt: new Date(),
    users: { total: users },
    accounts: {
      counts: accountCounts,
      balances: {
        assets: totalsArray(categoryTotals.asset),
        liabilities: totalsArray(categoryTotals.liability),
        equity: totalsArray(categoryTotals.equity),
        revenue: totalsArray(categoryTotals.revenue),
        expenses: totalsArray(categoryTotals.expense),
        cash: totalsArray(cashTotals)
      }
    },
    ledger: {
      journals: journalEntries.reduce<Record<string, number>>((result, row) => {
        result[row.status] = row._count._all;
        return result;
      }, {}),
      journalLines,
      accountBalances: balances.length,
      partnerLedgerAccounts,
      recentTransactions: recentJournals.map((journal) => {
        const lines = journal.lines.map((line) => ({
          id: line.id,
          lineNo: line.lineNo,
          account: line.account,
          partner: line.partner,
          currencyCode: line.currencyCode,
          debit: numberValue(line.debit),
          credit: numberValue(line.credit),
          memo: line.memo
        }));
        const receiverLine = lines.find((line) => line.debit > 0);
        const payerLine = lines.find((line) => line.credit > 0);
        const currencyTotals = netJournalTotals(lines);

        return {
          id: journal.id,
          number: journal.number,
          entryDate: journal.entryDate,
          description: journal.description,
          reason: journal.description,
          sourceType: journal.sourceType,
          sourceId: journal.sourceId,
          payerAccount: payerLine?.account ?? null,
          receiverAccount: receiverLine?.account ?? null,
          debitTotal: lines.reduce((sum, line) => sum + line.debit, 0),
          creditTotal: lines.reduce((sum, line) => sum + line.credit, 0),
          currencyTotals,
          lines
        };
      })
    },
    partners: {
      total: partners.length,
      active: partners.filter((partner) => partner.isActive).length,
      byType: partnersByType
    },
    inventory: {
      products: products.length,
      activeProducts: products.filter((product) => product.isActive).length,
      locationsWithStock: inventoryBalances.length,
      lowStockProducts,
      costValue: inventoryCostValue
    },
    sales: {
      invoices: salesInvoices.length,
      posted: salesInvoices.filter((invoice) => invoice.status === "posted").length,
      totals: totalsArray(salesTotals),
      outstanding: totalsArray(salesOutstanding)
    },
    purchases: {
      bills: purchaseBills.length,
      posted: purchaseBills.filter((bill) => bill.status === "posted").length,
      totals: totalsArray(purchaseTotals),
      outstanding: totalsArray(purchaseOutstanding)
    },
    payments: {
      count: payments.length,
      totals: totalsArray(paymentTotals)
    },
    transfers: {
      count: transfers.length,
      posted: transfers.filter((transfer) => transfer.status === "posted").length,
      totals: totalsArray(transferTotals)
    }
  };
}
