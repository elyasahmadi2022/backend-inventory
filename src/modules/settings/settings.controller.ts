import type { Response } from "express";
import { publicUploadPath } from "../../middleware/upload.js";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  createDatabaseBackup,
  getSettings,
  getInvoiceTemplate,
  updateInvoiceTemplate,
  updateSettings,
} from "./settings.model.js";
import {
  getBackupDirectories,
  getBackupSchedule,
  updateBackupSchedule,
  writeBackupToConfiguredFolder,
} from "./backup.service.js";

export const getSettingsController = asyncHandler(async (_req, res) => {
  res.json(await getSettings());
});

export const updateSettingsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await updateSettings(req.body, publicUploadPath(req.file)));
  },
);

export const getInvoiceTemplateController = asyncHandler(async (_req, res) => {
  res.json(await getInvoiceTemplate());
});

export const updateInvoiceTemplateController = asyncHandler(
  async (req, res) => {
    res.json(await updateInvoiceTemplate(req.body));
  },
);

export const downloadBackupController = asyncHandler(async (_req, res) => {
  const backup = await createDatabaseBackup();
  const stamp = backup.createdAt.replaceAll(":", "-");
  const body = JSON.stringify(backup, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="store-backup-${stamp}.json"`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
});

export const getBackupScheduleController = asyncHandler(async (_req, res) => {
  res.json(await getBackupSchedule());
});

export const getBackupDirectoriesController = asyncHandler(
  async (_req, res) => {
    res.json(await getBackupDirectories());
  },
);

export const updateBackupScheduleController = asyncHandler(async (req, res) => {
  res.json(await updateBackupSchedule(req.body));
});

export const runBackupController = asyncHandler(async (_req, res) => {
  res.status(201).json(await writeBackupToConfiguredFolder());
});
