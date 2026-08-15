import { prisma } from "../src/db/prisma.js";
import { assertBalancedJournalLines } from "../src/utils/accounting.js";

const tolerance = 0.01;

async function main() {
  const bases = await prisma.currency.findMany({ where: { isBase: true, isActive: true } });
  if (bases.length !== 1) throw new Error(`Expected exactly one active base currency; found ${bases.length}`);

  const journals = await prisma.journalEntry.findMany({
    where: { status: { in: ["posted", "reversed"] } },
    include: { lines: true },
  });
  for (const journal of journals) {
    try {
      assertBalancedJournalLines(journal.lines.map((line) => ({
        currencyCode: line.currencyCode,
        exchangeRateToBase: Number(line.exchangeRateToBase),
        debit: Number(line.debit),
        credit: Number(line.credit),
        baseDebit: Number(line.baseDebit),
        baseCredit: Number(line.baseCredit),
      })));
    } catch (error) {
      throw new Error(`Journal ${journal.number} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId", "currencyCode"],
    where: { journalEntry: { status: { in: ["posted", "reversed"] } } },
    _sum: { debit: true, credit: true },
  });
  const accounts = await prisma.account.findMany({ select: { id: true, code: true, normalBalance: true } });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const storedBalances = await prisma.accountBalance.findMany();
  const storedByKey = new Map(storedBalances.map((row) => [`${row.accountId}:${row.currencyCode}`, Number(row.balance)]));
  for (const row of grouped) {
    const account = accountById.get(row.accountId);
    if (!account) throw new Error(`Missing account ${row.accountId}`);
    const debit = Number(row._sum.debit ?? 0);
    const credit = Number(row._sum.credit ?? 0);
    const expected = account.normalBalance === "debit" ? debit - credit : credit - debit;
    const stored = storedByKey.get(`${row.accountId}:${row.currencyCode}`) ?? 0;
    if (Math.abs(expected - stored) > tolerance) {
      throw new Error(`Account ${account.code} ${row.currencyCode} cache differs: journal=${expected}, stored=${stored}`);
    }
  }

  const negativeStock = await prisma.inventoryBalance.findFirst({ where: { quantity: { lt: 0 } } });
  if (negativeStock) throw new Error(`Negative inventory balance found for product ${negativeStock.productId}`);

  console.log(`Accounting audit passed: ${journals.length} journals, ${grouped.length} account-currency balances.`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
