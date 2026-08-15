import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();
const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);

export const saleIdParamsSchema = z.object({
  id: uuidSchema
});

export const saleNumberParamsSchema = z.object({
  number: z.string().trim().min(2).max(30)
});

export const listSalesQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["draft", "posted", "partially_paid", "paid", "cancelled"]).optional(),
  customerId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const saleLineSchema = z.object({
  productId: uuidSchema,
  locationId: uuidSchema,
  description: z.string().trim().min(1).max(300).optional(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).default(0)
}).superRefine((line, ctx) => {
  if (line.discount > line.quantity * line.unitPrice) {
    ctx.addIssue({ code: "custom", path: ["discount"], message: "Discount cannot exceed the line value" });
  }
});

export const createSaleSchema = z.object({
  customerId: uuidSchema.optional(),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  currencyCode: currencyCodeSchema,
  exchangeRateToBase: z.coerce.number().positive().default(1),
  productCurrencyCode: currencyCodeSchema.optional(),
  productExchangeRate: z.coerce.number().positive().optional(),
  revenueAccountId: uuidSchema.optional(),
  inventoryAccountId: uuidSchema.optional(),
  cogsAccountId: uuidSchema.optional(),
  taxTotal: z.coerce.number().min(0).default(0),
  receiptAccountId: uuidSchema.optional(),
  receivedAmount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().min(1).max(500).optional(),
  lines: z.array(saleLineSchema).min(1)
}).refine((data) => data.taxTotal === 0, {
  message: "Tax posting requires configured tax payable accounts and is not enabled yet",
  path: ["taxTotal"]
});

export const updateSaleSchema = createSaleSchema;

export const salePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  receiptAccountId: uuidSchema.optional(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().trim().min(1).max(500).optional()
});

export const saleReturnLineSchema = z.object({
  lineId: uuidSchema,
  quantity: z.coerce.number().positive()
});

export const saleReturnSchema = z.object({
  lines: z.array(saleReturnLineSchema).min(1),
  refundAccountId: uuidSchema.optional(),
  notes: z.string().trim().min(1).max(500).optional()
}).superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    if (seen.has(line.lineId)) {
      ctx.addIssue({ code: "custom", path: ["lines", index, "lineId"], message: "A sales line can only be returned once per request" });
    }
    seen.add(line.lineId);
  });
});

export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
export type SalePaymentInput = z.infer<typeof salePaymentSchema>;
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;
