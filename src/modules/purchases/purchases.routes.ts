import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  cancelPurchaseController,
  createPurchaseController,
  getPurchaseByNumberController,
  getPurchaseController,
  listPurchasesController,
  payPurchaseBillController,
  returnPurchaseProductsController,
  updatePurchaseController
} from "./purchases.controller.js";
import {
  createPurchaseSchema,
  listPurchasesQuerySchema,
  purchaseIdParamsSchema,
  purchaseNumberParamsSchema,
  purchasePaymentSchema,
  purchaseReturnSchema,
  updatePurchaseSchema
} from "./purchases.validation.js";

export const purchasesRouter = Router();

purchasesRouter.use(requireAuth);
purchasesRouter.use(requirePermission("purchases.manage"));

purchasesRouter.get(
  "/",
  validate({ query: listPurchasesQuerySchema }),
  listPurchasesController
);
purchasesRouter.post(
  "/",
  validate({ body: createPurchaseSchema }),
  createPurchaseController
);
purchasesRouter.get(
  "/number/:number",
  validate({ params: purchaseNumberParamsSchema }),
  getPurchaseByNumberController
);
purchasesRouter.post(
  "/:id/payments",
  validate({ params: purchaseIdParamsSchema, body: purchasePaymentSchema }),
  payPurchaseBillController
);
purchasesRouter.post(
  "/:id/returns",
  validate({ params: purchaseIdParamsSchema, body: purchaseReturnSchema }),
  returnPurchaseProductsController
);
purchasesRouter.patch(
  "/:id",
  validate({ params: purchaseIdParamsSchema, body: updatePurchaseSchema }),
  updatePurchaseController
);
purchasesRouter.delete(
  "/:id",
  validate({ params: purchaseIdParamsSchema }),
  cancelPurchaseController
);
purchasesRouter.get(
  "/:id",
  validate({ params: purchaseIdParamsSchema }),
  getPurchaseController
);
