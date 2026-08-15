import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

const uuidSchema = z.string().uuid();
const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);
const locationTypeSchema = z.enum([
  "warehouse",
  "store",
  "shelf",
  "in_transit",
  "damaged"
]);

export const productIdParamsSchema = z.object({
  id: uuidSchema
});

export const productCodeParamsSchema = z.object({
  code: z.string().trim().min(2).max(60)
});

export const categoryIdParamsSchema = z.object({
  id: uuidSchema
});

export const unitIdParamsSchema = z.object({
  id: uuidSchema
});

export const listProductsQuerySchema = z.object({
  ...paginationQuerySchema,
  search: z.string().trim().min(1).optional(),
  categoryId: uuidSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
});

export const createProductCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  parentId: uuidSchema.optional()
});

export const updateProductCategorySchema = createProductCategorySchema.partial();

export const createUnitSchema = z.object({
  code: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(80)
});

export const updateUnitSchema = createUnitSchema.partial();

export const createProductSchema = z.object({
  sku: z.string().trim().min(2).max(60).optional(),
  barcode: z.string().trim().min(2).max(80).optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(1000).optional(),
  categoryId: uuidSchema.optional(),
  baseUnitId: uuidSchema,
  preferredPurchaseCurrency: currencyCodeSchema.default("USD"),
  preferredSaleCurrency: currencyCodeSchema.default("AFN"),
  standardCost: z.coerce.number().min(0).default(0),
  defaultSalePrice: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  isActive: z.boolean().optional()
});

export const updateProductSchema = createProductSchema.partial();

export const createInventoryLocationSchema = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(120),
  type: locationTypeSchema.default("warehouse"),
  parentId: uuidSchema.optional(),
  isActive: z.boolean().optional()
});

export const createInventoryTransferSchema = z
  .object({
    movedAt: z.coerce.date().optional(),
    productId: uuidSchema,
    fromLocationId: uuidSchema,
    toLocationId: uuidSchema,
    quantity: z.coerce.number().positive(),
    reference: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().min(1).max(500).optional()
  })
  .refine((data) => data.fromLocationId !== data.toLocationId, {
    message: "From and to locations must be different",
    path: ["toLocationId"]
  });

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
export type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateInventoryLocationInput = z.infer<typeof createInventoryLocationSchema>;
export type CreateInventoryTransferInput = z.infer<typeof createInventoryTransferSchema>;
