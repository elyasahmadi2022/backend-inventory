import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  cancelSaleController,
  createSaleController,
  getSaleByNumberController,
  getSaleController,
  listSalesController,
  receiveSalePaymentController,
  returnSaleProductsController,
  updateSaleController
} from "./sales.controller.js";
import {
  createSaleSchema,
  listSalesQuerySchema,
  saleIdParamsSchema,
  saleNumberParamsSchema,
  salePaymentSchema,
  saleReturnSchema,
  updateSaleSchema
} from "./sales.validation.js";

export const salesRouter = Router();

salesRouter.use(requireAuth);
salesRouter.use(requirePermission("sales.manage"));

salesRouter.get(
  "/",
  validate({ query: listSalesQuerySchema }),
  listSalesController
);
salesRouter.post("/", validate({ body: createSaleSchema }), createSaleController);
salesRouter.get(
  "/number/:number",
  validate({ params: saleNumberParamsSchema }),
  getSaleByNumberController
);
salesRouter.post(
  "/:id/payments",
  validate({ params: saleIdParamsSchema, body: salePaymentSchema }),
  receiveSalePaymentController
);
salesRouter.post(
  "/:id/returns",
  validate({ params: saleIdParamsSchema, body: saleReturnSchema }),
  returnSaleProductsController
);
salesRouter.patch(
  "/:id",
  validate({ params: saleIdParamsSchema, body: updateSaleSchema }),
  updateSaleController
);
salesRouter.delete(
  "/:id",
  validate({ params: saleIdParamsSchema }),
  cancelSaleController
);
salesRouter.get(
  "/:id",
  validate({ params: saleIdParamsSchema }),
  getSaleController
);
