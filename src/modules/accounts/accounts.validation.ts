import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();

export const accountIdParamsSchema = z.object({
  id: uuidSchema
});

export const accountCodeParamsSchema = z.object({
  code: z.string().trim().min(2).max(30)
});

export const accountCategorySchema = z.enum([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense"
]);

export const accountTypeSchema = z.enum([
  "cash",
  "bank",
  "sarafi",
  "daskhil",
  "accounts_receivable",
  "accounts_payable",
  "inventory",
  "cost_of_goods_sold",
  "sales_revenue",
  "purchase",
  "expense",
  "equity",
  "liability",
  "exchange_gain",
  "exchange_loss",
  "other"
]);

export const debitCreditSchema = z.enum(["debit", "credit"]);
export const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);

export const listAccountsQuerySchema = z.object({
  ...paginationQuerySchema,
  type: accountTypeSchema.optional(),
  category: accountCategorySchema.optional(),
  currencyCode: currencyCodeSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
});

export const createAccountSchema = z.object({
  code: z.string().trim().min(2).max(30).optional(),
  name: z.string().trim().min(2).max(120),
  category: accountCategorySchema,
  type: accountTypeSchema,
  normalBalance: debitCreditSchema,
  currencyCode: currencyCodeSchema,
  parentId: uuidSchema.optional(),
  isControlAccount: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export const updateAccountSchema = createAccountSchema
  .omit({ code: true })
  .partial()
  .extend({
    code: z.string().trim().min(2).max(30).optional()
  });

export const recordExpenseSchema = z.object({
  expenseDate: z.coerce.date(),
  description: z.string().trim().min(2).max(240),
  expenseAccountId: uuidSchema,
  paymentAccountId: uuidSchema,
  currencyCode: currencyCodeSchema,
  amount: z.coerce.number().positive(),
  exchangeRateToBase: z.coerce.number().positive().default(1),
  notes: z.string().trim().max(500).optional()
});

export const recordFundingSchema = z.object({
  fundingDate: z.coerce.date(),
  description: z.string().trim().min(2).max(240),
  assetAccountId: uuidSchema,
  equityAccountId: uuidSchema,
  currencyCode: currencyCodeSchema,
  amount: z.coerce.number().positive(),
  isOpeningBalance: z.boolean().default(false),
  notes: z.string().trim().max(500).optional()
});

export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;
export type RecordFundingInput = z.infer<typeof recordFundingSchema>;
