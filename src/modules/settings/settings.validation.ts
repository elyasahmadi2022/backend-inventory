import { z } from "zod";

export const updateSettingsSchema = z.object({
  storeName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  address: z.string().trim().min(2).max(300).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  country: z.string().trim().min(2).max(80).optional(),
  website: z.string().trim().url().optional(),
  taxNumber: z.string().trim().min(2).max(80).optional(),
  invoiceNote: z.string().trim().min(2).max(500).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

const invoiceSectionSchema = z.enum([
  "header",
  "partner",
  "lines",
  "summary",
  "footer",
]);
const invoicePositionSchema = z.object({
  x: z.number().min(0).max(1400),
  y: z.number().min(0).max(1400),
  width: z.number().min(180).max(1400),
});

export const invoiceTemplateSchema = z.object({
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  pageSize: z.enum(["a4", "a5", "letter"]),
  orientation: z.enum(["portrait", "landscape"]),
  compact: z.boolean(),
  showLogo: z.boolean(),
  showContact: z.boolean(),
  showNotes: z.boolean(),
  showSignature: z.boolean(),
  sectionOrder: z
    .array(invoiceSectionSchema)
    .length(5)
    .refine(
      (items) => new Set(items).size === 5,
      "Invoice sections must be unique",
    ),
  positions: z.object({
    header: invoicePositionSchema,
    partner: invoicePositionSchema,
    lines: invoicePositionSchema,
    summary: invoicePositionSchema,
    footer: invoicePositionSchema,
  }),
});

export type InvoiceTemplateInput = z.infer<typeof invoiceTemplateSchema>;

export const updateBackupScheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["hourly", "daily", "weekly"]),
  path: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine(
      (value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."),
      "Backup path must be a safe relative folder",
    ),
});

export type UpdateBackupScheduleInput = z.infer<
  typeof updateBackupScheduleSchema
>;
