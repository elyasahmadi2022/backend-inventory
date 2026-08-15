import assert from "node:assert/strict";
import test from "node:test";
import { assertBalancedJournalLines } from "../src/utils/accounting.js";

const debit = {
  currencyCode: "USD" as const,
  exchangeRateToBase: 70,
  debit: 10,
  credit: 0,
  baseDebit: 700,
  baseCredit: 0,
};

const credit = {
  currencyCode: "AFN" as const,
  exchangeRateToBase: 1,
  debit: 0,
  credit: 700,
  baseDebit: 0,
  baseCredit: 700,
};

test("accepts a base-balanced cross-currency journal", () => {
  assert.doesNotThrow(() => assertBalancedJournalLines([debit, credit]));
});

test("rejects a journal whose base debits and credits differ", () => {
  assert.throws(() =>
    assertBalancedJournalLines([debit, { ...credit, credit: 699, baseCredit: 699 }]),
  );
});

test("rejects a line containing both debit and credit", () => {
  assert.throws(() =>
    assertBalancedJournalLines([
      { ...debit, credit: 1, baseCredit: 70 },
      { ...credit, credit: 630, baseCredit: 630 },
    ]),
  );
});

test("rejects a line whose native amount does not match its rate", () => {
  assert.throws(() =>
    assertBalancedJournalLines([
      { ...debit, baseDebit: 701 },
      { ...credit, credit: 701, baseCredit: 701 },
    ]),
  );
});

test("rejects empty and negative journal lines", () => {
  assert.throws(() =>
    assertBalancedJournalLines([
      { ...debit, debit: 0, baseDebit: 0 },
      credit,
    ]),
  );
  assert.throws(() =>
    assertBalancedJournalLines([
      { ...debit, debit: -10, baseDebit: -700 },
      credit,
    ]),
  );
});
