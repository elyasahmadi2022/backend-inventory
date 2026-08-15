import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { listOperationsController } from "./operations.controller.js";
import { listOperationsQuerySchema } from "./operations.validation.js";

export const operationsRouter = Router();
operationsRouter.use(requireAuth, requirePermission("payments.manage"));
operationsRouter.get("/", validate({ query: listOperationsQuerySchema }), listOperationsController);
