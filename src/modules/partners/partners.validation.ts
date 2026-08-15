import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();

export const partnerIdParamsSchema = z.object({
  id: uuidSchema
});

export const partnerCodeParamsSchema = z.object({
  code: z.string().trim().min(2).max(30)
});

export const partnerTypeSchema = z.enum([
  "customer",
  "vendor",
  "both",
  "sarafi",
  "staff"
]);

export const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);

export const listPartnersQuerySchema = z.object({
  ...paginationQuerySchema,
  type: partnerTypeSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
});

export const createPartnerSchema = z.object({
  code: z.string().trim().min(2).max(30).optional(),
  name: z.string().trim().min(2).max(120),
  type: partnerTypeSchema,
  phone: z.string().trim().min(3).max(40).optional(),
  address: z.string().trim().min(2).max(300).optional(),
  receivableAccountId: uuidSchema.optional(),
  payableAccountId: uuidSchema.optional(),
  ledgerCurrencies: z.array(currencyCodeSchema).min(1).default(["AFN"]),
  isActive: z.boolean().optional()
});

export const updatePartnerSchema = createPartnerSchema
  .omit({ code: true, ledgerCurrencies: true })
  .partial()
  .extend({
    code: z.string().trim().min(2).max(30).optional()
  });

export const createPartnerLedgerAccountSchema = z.object({
  accountId: uuidSchema,
  currencyCode: currencyCodeSchema,
  type: z.enum([
    "receivable",
    "payable",
    "advance_received",
    "advance_paid",
    "deposit"
  ]),
  isDefault: z.boolean().optional()
});

export type ListPartnersQuery = z.infer<typeof listPartnersQuerySchema>;
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
export type CreatePartnerLedgerAccountInput = z.infer<
  typeof createPartnerLedgerAccountSchema
>;
