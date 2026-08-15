import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

export const currencyCodeSchema = z.enum(["AFN", "USD", "PKR"]);

export const currencyCodeParamsSchema = z.object({
  code: currencyCodeSchema
});

export const createCurrencySchema = z.object({
  code: currencyCodeSchema,
  name: z.string().trim().min(2),
  symbol: z.string().trim().min(1).max(8),
  decimalPlaces: z.number().int().min(0).max(6).default(2),
  isBase: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export const updateCurrencySchema = z.object({
  name: z.string().trim().min(2).optional(),
  symbol: z.string().trim().min(1).max(8).optional(),
  decimalPlaces: z.number().int().min(0).max(6).optional(),
  isBase: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export const createExchangeRateSchema = z
  .object({
    fromCurrency: currencyCodeSchema,
    toCurrency: currencyCodeSchema,
    rate: z.coerce.number().positive(),
    effectiveAt: z.coerce.date().optional()
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: "Currencies must be different"
  });

export const listExchangeRatesQuerySchema = z.object({
  ...paginationQuerySchema,
  fromCurrency: currencyCodeSchema.optional(),
  toCurrency: currencyCodeSchema.optional()
});

export const conversionRateQuerySchema = z
  .object({
    fromCurrency: currencyCodeSchema,
    toCurrency: currencyCodeSchema,
    effectiveAt: z.coerce.date().optional()
  });

export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;
export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;
export type CreateExchangeRateInput = z.infer<typeof createExchangeRateSchema>;
export type ListExchangeRatesQuery = z.infer<typeof listExchangeRatesQuerySchema>;
export type ConversionRateQuery = z.infer<typeof conversionRateQuerySchema>;
