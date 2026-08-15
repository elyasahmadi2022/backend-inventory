import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import {
  accountBalances,
  accountLedger,
  balanceSheet,
  cashBalances,
  dailyReport,
  financialSummary,
  incomeStatement,
  inventoryBalances,
  journalReport,
  monthlyReport
} from "./reports.model.js";
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

export const dailyReportController = asyncHandler(async (req, res) => {
  res.json(await dailyReport(typedQuery<DailyReportQuery>(req)));
});

export const monthlyReportController = asyncHandler(async (req, res) => {
  res.json(await monthlyReport(typedQuery<MonthlyReportQuery>(req)));
});

export const accountLedgerController = asyncHandler(async (req, res) => {
  res.json(await accountLedger(typedQuery<AccountLedgerQuery>(req)));
});

export const journalReportController = asyncHandler(async (req, res) => {
  res.json(await journalReport(typedQuery<JournalReportQuery>(req)));
});

export const financialSummaryController = asyncHandler(async (req, res) => {
  res.json(await financialSummary(typedQuery<FinancialSummaryQuery>(req)));
});

export const incomeStatementController = asyncHandler(async (req, res) => {
  res.json(await incomeStatement(typedQuery<IncomeStatementQuery>(req)));
});

export const balanceSheetController = asyncHandler(async (req, res) => {
  res.json(await balanceSheet(typedQuery<BalanceSheetQuery>(req)));
});

export const accountBalancesController = asyncHandler(async (req, res) => {
  res.json(await accountBalances(typedQuery<AccountBalancesQuery>(req)));
});

export const cashBalancesController = asyncHandler(async (_req, res) => {
  res.json(await cashBalances());
});

export const inventoryBalancesController = asyncHandler(async (req, res) => {
  res.json(await inventoryBalances(typedQuery<InventoryBalancesQuery>(req)));
});
