import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  accountBalancesController,
  accountLedgerController,
  balanceSheetController,
  cashBalancesController,
  dailyReportController,
  financialSummaryController,
  incomeStatementController,
  inventoryBalancesController,
  journalReportController,
  monthlyReportController
} from "./reports.controller.js";
import {
  accountBalancesQuerySchema,
  accountLedgerQuerySchema,
  balanceSheetQuerySchema,
  dailyReportQuerySchema,
  financialSummaryQuerySchema,
  incomeStatementQuerySchema,
  inventoryBalancesQuerySchema,
  journalReportQuerySchema,
  monthlyReportQuerySchema
} from "./reports.validation.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.use(requirePermission("reports.view"));

reportsRouter.get(
  "/daily",
  validate({ query: dailyReportQuerySchema }),
  dailyReportController
);
reportsRouter.get(
  "/monthly",
  validate({ query: monthlyReportQuerySchema }),
  monthlyReportController
);
reportsRouter.get(
  "/account-ledger",
  validate({ query: accountLedgerQuerySchema }),
  accountLedgerController
);
reportsRouter.get(
  "/journal",
  validate({ query: journalReportQuerySchema }),
  journalReportController
);
reportsRouter.get(
  "/financial-summary",
  validate({ query: financialSummaryQuerySchema }),
  financialSummaryController
);
reportsRouter.get(
  "/income-statement",
  validate({ query: incomeStatementQuerySchema }),
  incomeStatementController
);
reportsRouter.get(
  "/balance-sheet",
  validate({ query: balanceSheetQuerySchema }),
  balanceSheetController
);
reportsRouter.get(
  "/account-balances",
  validate({ query: accountBalancesQuerySchema }),
  accountBalancesController
);
reportsRouter.get("/cash-balances", cashBalancesController);
reportsRouter.get(
  "/inventory-balances",
  validate({ query: inventoryBalancesQuerySchema }),
  inventoryBalancesController
);
