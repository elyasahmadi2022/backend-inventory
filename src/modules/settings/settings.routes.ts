import { Router } from "express";
import { imageUpload } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import {
  downloadBackupController,
  getBackupDirectoriesController,
  getBackupScheduleController,
  runBackupController,
  updateBackupScheduleController,
  getSettingsController,
  getInvoiceTemplateController,
  updateInvoiceTemplateController,
  updateSettingsController,
} from "./settings.controller.js";
import {
  updateBackupScheduleSchema,
  updateSettingsSchema,
  invoiceTemplateSchema,
} from "./settings.validation.js";

export const settingsRouter = Router();

settingsRouter.get(
  "/invoice-template",
  requireAuth,
  getInvoiceTemplateController,
);
settingsRouter.patch(
  "/invoice-template",
  requireAuth,
  requirePermission("settings.manage"),
  validate({ body: invoiceTemplateSchema }),
  updateInvoiceTemplateController,
);

settingsRouter.get(
  "/backup/directories",
  requireAuth,
  requirePermission("settings.manage"),
  getBackupDirectoriesController,
);

settingsRouter.get(
  "/backup/schedule",
  requireAuth,
  requirePermission("settings.manage"),
  getBackupScheduleController,
);
settingsRouter.patch(
  "/backup/schedule",
  requireAuth,
  requirePermission("settings.manage"),
  validate({ body: updateBackupScheduleSchema }),
  updateBackupScheduleController,
);
settingsRouter.post(
  "/backup/run",
  requireAuth,
  requirePermission("settings.manage"),
  runBackupController,
);

settingsRouter.get(
  "/backup",
  requireAuth,
  requirePermission("settings.manage"),
  downloadBackupController,
);

settingsRouter.get("/", getSettingsController);
settingsRouter.patch(
  "/",
  requireAuth,
  requirePermission("settings.manage"),
  imageUpload("settings").single("logo"),
  validate({ body: updateSettingsSchema }),
  updateSettingsController,
);
