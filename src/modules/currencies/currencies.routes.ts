import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  createCurrencyController,
  conversionRateController,
  createExchangeRateController,
  deleteCurrencyController,
  listCurrenciesController,
  listExchangeRatesController,
  updateCurrencyController
} from "./currencies.controller.js";
import {
  createCurrencySchema,
  createExchangeRateSchema,
  conversionRateQuerySchema,
  currencyCodeParamsSchema,
  listExchangeRatesQuerySchema,
  updateCurrencySchema
} from "./currencies.validation.js";

export const currenciesRouter = Router();

currenciesRouter.use(requireAuth);

currenciesRouter.get("/", listCurrenciesController);
currenciesRouter.get(
  "/conversion-rate",
  validate({ query: conversionRateQuerySchema }),
  conversionRateController
);
currenciesRouter.post(
  "/",
  requirePermission("accounts.manage"),
  validate({ body: createCurrencySchema }),
  createCurrencyController
);
currenciesRouter.patch(
  "/:code",
  requirePermission("accounts.manage"),
  validate({ params: currencyCodeParamsSchema, body: updateCurrencySchema }),
  updateCurrencyController
);
currenciesRouter.delete(
  "/:code",
  requirePermission("accounts.manage"),
  validate({ params: currencyCodeParamsSchema }),
  deleteCurrencyController
);
currenciesRouter.get(
  "/exchange-rates",
  validate({ query: listExchangeRatesQuerySchema }),
  listExchangeRatesController
);
currenciesRouter.post(
  "/exchange-rates",
  requirePermission("accounts.manage"),
  validate({ body: createExchangeRateSchema }),
  createExchangeRateController
);
