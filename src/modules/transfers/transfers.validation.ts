import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();
const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);

export const transferIdParamsSchema = z.object({
  id: uuidSchema
});

export const transferNumberParamsSchema = z.object({
  number: z.string().trim().min(2).max(30)
});

export const listTransfersQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["draft", "posted", "cancelled"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const createTransferSchema = z.object({
  transferDate: z.coerce.date(),
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema,
  currencyCode: currencyCodeSchema,
  destinationCurrencyCode: currencyCodeSchema.optional(),
  destinationAmount: z.coerce.number().positive().optional(),
  conversionRate: z.coerce.number().positive().optional(),
  exchangeRateToBase: z.coerce.number().positive().default(1),
  amount: z.coerce.number().positive(),
  feeAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().min(1).max(500).optional()
}).refine((data) => data.fromAccountId !== data.toAccountId, {
  message: "Transfer accounts must be different",
  path: ["toAccountId"]
}).superRefine((data, ctx) => {
  if (data.destinationCurrencyCode && data.destinationCurrencyCode !== data.currencyCode) {
    if (!data.destinationAmount) ctx.addIssue({ code: "custom", path: ["destinationAmount"], message: "Received amount is required for a currency exchange" });
    if (!data.conversionRate) ctx.addIssue({ code: "custom", path: ["conversionRate"], message: "Exchange rate is required for a currency exchange" });
  }
}).refine((data) => data.feeAmount === 0, {
  message: "Transfer fees need a fee expense account and will be added in the next accounting step",
  path: ["feeAmount"]
});

export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
