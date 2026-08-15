import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();
const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);
const journalStatusSchema = z.enum(["draft", "posted", "reversed", "voided"]);
const journalSourceTypeSchema = z.enum([
  "manual",
  "sale",
  "purchase",
  "payment",
  "money_transfer",
  "inventory_adjustment",
  "opening_balance"
]);

const dateRangeQuerySchema = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
};

export const dailyReportQuerySchema = z.object({
  date: z.coerce.date().optional()
});

export const monthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12)
});

export const accountLedgerQuerySchema = z.object({
  ...paginationQuerySchema,
  accountId: uuidSchema,
  ...dateRangeQuerySchema
});

export const journalReportQuerySchema = z.object({
  ...paginationQuerySchema,
  ...dateRangeQuerySchema,
  status: journalStatusSchema.optional(),
  sourceType: journalSourceTypeSchema.optional(),
  accountId: uuidSchema.optional(),
  partnerId: uuidSchema.optional(),
  currencyCode: currencyCodeSchema.optional(),
  number: z.string().trim().min(1).max(80).optional()
});

export const financialSummaryQuerySchema = z.object({
  ...dateRangeQuerySchema
});

export const incomeStatementQuerySchema = z.object({
  ...dateRangeQuerySchema
});

export const balanceSheetQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export const accountBalancesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  currencyCode: currencyCodeSchema.optional()
});

export const inventoryBalancesQuerySchema = z.object({
  ...paginationQuerySchema,
  productId: uuidSchema.optional(),
  locationId: uuidSchema.optional()
});

export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;
export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;
export type AccountLedgerQuery = z.infer<typeof accountLedgerQuerySchema>;
export type JournalReportQuery = z.infer<typeof journalReportQuerySchema>;
export type FinancialSummaryQuery = z.infer<typeof financialSummaryQuerySchema>;
export type IncomeStatementQuery = z.infer<typeof incomeStatementQuerySchema>;
export type BalanceSheetQuery = z.infer<typeof balanceSheetQuerySchema>;
export type AccountBalancesQuery = z.infer<typeof accountBalancesQuerySchema>;
export type InventoryBalancesQuery = z.infer<typeof inventoryBalancesQuerySchema>;
