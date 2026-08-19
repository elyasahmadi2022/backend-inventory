import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();
const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);

export const purchaseIdParamsSchema = z.object({
  id: uuidSchema
});

export const purchaseNumberParamsSchema = z.object({
  number: z.string().trim().min(2).max(30)
});

export const listPurchasesQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["draft", "posted", "partially_paid", "paid", "cancelled"]).optional(),
  vendorId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const purchaseLineSchema = z.object({
  productId: uuidSchema,
  locationId: uuidSchema,
  description: z.string().trim().min(1).max(300).optional(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0)
}).superRefine((line, ctx) => {
  if (line.discount > line.quantity * line.unitCost) {
    ctx.addIssue({ code: "custom", path: ["discount"], message: "Discount cannot exceed the line value" });
  }
});

export const createPurchaseSchema = z.object({
  vendorId: uuidSchema,
  billDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  isImportant: z.boolean().optional().default(false),
  currencyCode: currencyCodeSchema,
  exchangeRateToBase: z.coerce.number().positive().default(1),
  productExchangeRate: z.coerce.number().positive().optional(),
  inventoryAccountId: uuidSchema.optional(),
  expenseAccountId: uuidSchema.optional(),
  taxTotal: z.coerce.number().min(0).default(0),
  paymentAccountId: uuidSchema.optional(),
  paidAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().min(1).max(500).optional(),
  lines: z.array(purchaseLineSchema).min(1)
}).refine((data) => data.taxTotal === 0, {
  message: "Tax posting requires configured recoverable-tax accounts and is not enabled yet",
  path: ["taxTotal"]
});

export const updatePurchaseSchema = createPurchaseSchema;

export const purchasePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentAccountId: uuidSchema.optional(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().trim().min(1).max(500).optional(),
  paymentExchangeRate: z.coerce.number().positive().optional(),
});

export const purchaseReturnLineSchema = z.object({
  lineId: uuidSchema,
  quantity: z.coerce.number().positive()
});

export const purchaseReturnSchema = z.object({
  lines: z.array(purchaseReturnLineSchema).min(1),
  refundAccountId: uuidSchema.optional(),
  notes: z.string().trim().min(1).max(500).optional()
}).superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    if (seen.has(line.lineId)) {
      ctx.addIssue({ code: "custom", path: ["lines", index, "lineId"], message: "A purchase line can only be returned once per request" });
    }
    seen.add(line.lineId);
  });
});

export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type PurchasePaymentInput = z.infer<typeof purchasePaymentSchema>;
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;
