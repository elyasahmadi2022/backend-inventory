import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  createTransferController,
  getTransferByNumberController,
  getTransferController,
  listTransfersController
} from "./transfers.controller.js";
import {
  createTransferSchema,
  listTransfersQuerySchema,
  transferIdParamsSchema,
  transferNumberParamsSchema
} from "./transfers.validation.js";

export const transfersRouter = Router();

transfersRouter.use(requireAuth);
transfersRouter.use(requirePermission("payments.manage"));

transfersRouter.get(
  "/",
  validate({ query: listTransfersQuerySchema }),
  listTransfersController
);
transfersRouter.post(
  "/",
  validate({ body: createTransferSchema }),
  createTransferController
);
transfersRouter.get(
  "/number/:number",
  validate({ params: transferNumberParamsSchema }),
  getTransferByNumberController
);
transfersRouter.get(
  "/:id",
  validate({ params: transferIdParamsSchema }),
  getTransferController
);
