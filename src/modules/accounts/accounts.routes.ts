import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  createAccountController,
  deleteAccountController,
  getAccountController,
  getAccountByCodeController,
  listAccountsController,
  recordExpenseController,
  recordFundingController,
  updateAccountController
} from "./accounts.controller.js";
import {
  accountIdParamsSchema,
  accountCodeParamsSchema,
  createAccountSchema,
  listAccountsQuerySchema,
  recordExpenseSchema,
  recordFundingSchema,
  updateAccountSchema
} from "./accounts.validation.js";

export const accountsRouter = Router();

accountsRouter.use(requireAuth);
accountsRouter.use(requirePermission("accounts.manage"));

accountsRouter.get(
  "/",
  validate({ query: listAccountsQuerySchema }),
  listAccountsController
);
accountsRouter.post("/", validate({ body: createAccountSchema }), createAccountController);
accountsRouter.post(
  "/expenses",
  validate({ body: recordExpenseSchema }),
  recordExpenseController
);
accountsRouter.post(
  "/funding",
  validate({ body: recordFundingSchema }),
  recordFundingController
);
accountsRouter.get(
  "/code/:code",
  validate({ params: accountCodeParamsSchema }),
  getAccountByCodeController
);
accountsRouter.get(
  "/:id",
  validate({ params: accountIdParamsSchema }),
  getAccountController
);
accountsRouter.patch(
  "/:id",
  validate({ params: accountIdParamsSchema, body: updateAccountSchema }),
  updateAccountController
);
accountsRouter.delete(
  "/:id",
  validate({ params: accountIdParamsSchema }),
  deleteAccountController
);
