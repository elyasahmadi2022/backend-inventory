import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../utils/app-error.js";
import { createDatabaseBackup } from "./settings.model.js";
import type { UpdateBackupScheduleInput } from "./settings.validation.js";

const backupRoot = path.resolve(process.cwd(), env.BACKUP_ROOT);
let schedulerRunning = false;

function nextRun(frequency: string, from = new Date()) {
  const hours =
    frequency === "hourly" ? 1 : frequency === "weekly" ? 24 * 7 : 24;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

function resolveBackupFolder(relativePath: string) {
  const folder = path.resolve(backupRoot, relativePath);
  if (folder !== backupRoot && !folder.startsWith(`${backupRoot}${path.sep}`)) {
    throw new AppError(
      400,
      "Backup path must stay inside the configured backup root",
    );
  }
  return folder;
}

async function settingsRow() {
  const existing = await prisma.storeSetting.findFirst({
    orderBy: { createdAt: "asc" },
  });
  return (
    existing ??
    prisma.storeSetting.create({ data: { storeName: "Store Management" } })
  );
}

function scheduleResponse(settings: Awaited<ReturnType<typeof settingsRow>>) {
  return {
    schedule: {
      enabled: settings.backupEnabled,
      frequency: settings.backupFrequency,
      path: settings.backupPath,
      lastRunAt: settings.backupLastRunAt,
      nextRunAt: settings.backupNextRunAt,
      lastFilename: settings.backupLastFilename,
      lastError: settings.backupLastError,
    },
    backupRoot,
    effectivePath: resolveBackupFolder(settings.backupPath),
  };
}

export async function getBackupSchedule() {
  return scheduleResponse(await settingsRow());
}

export async function getBackupDirectories() {
  await mkdir(backupRoot, { recursive: true });
  const entries = await readdir(backupRoot, { withFileTypes: true });
  return {
    backupRoot,
    directories: [
      ".",
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ],
  };
}

export async function updateBackupSchedule(input: UpdateBackupScheduleInput) {
  resolveBackupFolder(input.path);
  const current = await settingsRow();
  const scheduleChanged =
    current.backupFrequency !== input.frequency || !current.backupEnabled;
  const settings = await prisma.storeSetting.update({
    where: { id: current.id },
    data: {
      backupEnabled: input.enabled,
      backupFrequency: input.frequency,
      backupPath: input.path,
      backupNextRunAt: input.enabled
        ? scheduleChanged || !current.backupNextRunAt
          ? nextRun(input.frequency)
          : current.backupNextRunAt
        : null,
      backupLastError: null,
    },
  });
  return scheduleResponse(settings);
}

export async function writeBackupToConfiguredFolder() {
  const current = await settingsRow();
  const folder = resolveBackupFolder(current.backupPath);
  const backup = await createDatabaseBackup();
  // Milliseconds make each snapshot a retained version instead of replacing one.
  const stamp = backup.createdAt.replaceAll(":", "-");
  const filename = `store-backup-${stamp}.json`;
  const target = path.join(folder, filename);
  const temporary = `${target}.tmp`;
  const body = JSON.stringify(
    backup,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  await mkdir(folder, { recursive: true });
  await writeFile(temporary, body, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, target);
  const now = new Date();
  const settings = await prisma.storeSetting.update({
    where: { id: current.id },
    data: {
      backupLastRunAt: now,
      backupLastFilename: filename,
      backupLastError: null,
      backupNextRunAt: current.backupEnabled
        ? nextRun(current.backupFrequency, now)
        : null,
    },
  });
  return {
    ...scheduleResponse(settings),
    filename,
    size: Buffer.byteLength(body),
  };
}

async function schedulerTick() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const current = await settingsRow();
    if (
      !current.backupEnabled ||
      !current.backupNextRunAt ||
      current.backupNextRunAt > new Date()
    )
      return;
    await writeBackupToConfiguredFolder();
  } catch (error) {
    const current = await settingsRow();
    await prisma.storeSetting
      .update({
        where: { id: current.id },
        data: {
          backupLastError:
            error instanceof Error
              ? error.message.slice(0, 2000)
              : "Backup failed",
          backupNextRunAt: nextRun(current.backupFrequency),
        },
      })
      .catch(() => undefined);
    console.error("Scheduled database backup failed", error);
  } finally {
    schedulerRunning = false;
  }
}

export function startBackupScheduler() {
  void schedulerTick();
  const timer = setInterval(() => void schedulerTick(), 60_000);
  timer.unref();
}
