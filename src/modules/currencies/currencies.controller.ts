import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import type { ConversionRateQuery, ListExchangeRatesQuery } from "./currencies.validation.js";
import {
  createCurrency,
  createExchangeRate,
  deleteCurrency,
  listCurrencies,
  listExchangeRates,
  resolveConversionRate,
  updateCurrency
} from "./currencies.model.js";

export const conversionRateController = asyncHandler(async (req, res) => {
  res.json(await resolveConversionRate(typedQuery<ConversionRateQuery>(req)));
});

export const listCurrenciesController = asyncHandler(async (_req, res) => {
  res.json(await listCurrencies());
});

export const createCurrencyController = asyncHandler(async (req, res) => {
  res.status(201).json(await createCurrency(req.body));
});

export const updateCurrencyController = asyncHandler(async (req, res) => {
  res.json(await updateCurrency(req.params.code as "AFN" | "USD" | "PKR", req.body));
});

export const deleteCurrencyController = asyncHandler(async (req, res) => {
  res.json(await deleteCurrency(req.params.code as "AFN" | "USD" | "PKR"));
});

export const listExchangeRatesController = asyncHandler(async (_req, res) => {
  res.json(await listExchangeRates(typedQuery<ListExchangeRatesQuery>(_req)));
});

export const createExchangeRateController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await createExchangeRate(req.body, req.user?.id));
  }
);
