import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import { adminDashboardController } from "./dashboard.controller.js";
import { adminDashboardQuerySchema } from "./dashboard.validation.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.use(requirePermission("reports.view"));

dashboardRouter.get(
  "/admin",
  validate({ query: adminDashboardQuerySchema }),
  adminDashboardController
);
