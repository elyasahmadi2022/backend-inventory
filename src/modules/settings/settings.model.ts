import { prisma } from "../../db/prisma.js";
import { AppError } from "../../utils/app-error.js";
import type { UpdateSettingsInput } from "./settings.validation.js";
import type { InvoiceTemplateInput } from "./settings.validation.js";

const defaultSettings = {
  storeName: "Store Management",
};

export async function getSettings() {
  const settings =
    (await prisma.storeSetting.findFirst({
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.storeSetting.create({
      data: defaultSettings,
    }));

  return { settings };
}

export async function updateSettings(
  input: UpdateSettingsInput,
  logoUrl?: string,
) {
  if (Object.keys(input).length === 0 && !logoUrl) {
    throw new AppError(400, "No settings fields were provided");
  }

  const existing = await prisma.storeSetting.findFirst({
    orderBy: { createdAt: "asc" },
  });

  const data = {
    ...input,
    logoUrl,
  };

  const settings = existing
    ? await prisma.storeSetting.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.storeSetting.create({
        data: {
          ...defaultSettings,
          ...data,
        },
      });

  return { settings };
}

export const defaultInvoiceTemplate: InvoiceTemplateInput = {
  accentColor: "#075985",
  pageSize: "a4",
  orientation: "portrait",
  compact: false,
  showLogo: true,
  showContact: true,
  showNotes: true,
  showSignature: true,
  sectionOrder: ["header", "partner", "lines", "summary", "footer"],
  positions: {
    header: { x: 32, y: 32, width: 730 },
    partner: { x: 32, y: 190, width: 730 },
    lines: { x: 32, y: 330, width: 730 },
    summary: { x: 32, y: 650, width: 730 },
    footer: { x: 32, y: 850, width: 730 },
  },
};

export async function getInvoiceTemplate() {
  const { settings } = await getSettings();
  return {
    template: {
      ...defaultInvoiceTemplate,
      ...(settings.invoiceTemplate as Partial<InvoiceTemplateInput> | null),
    },
  };
}

export async function updateInvoiceTemplate(template: InvoiceTemplateInput) {
  const { settings } = await getSettings();
  const updated = await prisma.storeSetting.update({
    where: { id: settings.id },
    data: { invoiceTemplate: template },
  });
  return {
    template: {
      ...defaultInvoiceTemplate,
      ...(updated.invoiceTemplate as Partial<InvoiceTemplateInput> | null),
    },
  };
}

type DatabaseTableRow = { tableName: string };

export async function createDatabaseBackup() {
  const createdAt = new Date();
  const tables = await prisma.$transaction(
    async (tx) => {
      const tableRows = await tx.$queryRaw<DatabaseTableRow[]>`
      SELECT TABLE_NAME AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;

      const result: Record<string, unknown[]> = {};
      for (const { tableName } of tableRows) {
        if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
          throw new AppError(500, "Database contains an unsafe table name");
        }
        result[tableName] = await tx.$queryRawUnsafe<unknown[]>(
          `SELECT * FROM \`${tableName}\``,
        );
      }
      return result;
    },
    { isolationLevel: "RepeatableRead", timeout: 120_000 },
  );

  const tableCount = Object.keys(tables).length;
  const recordCount = Object.values(tables).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );
  return {
    format: "double-entry-system/mysql-json-backup",
    version: 1,
    createdAt: createdAt.toISOString(),
    databaseProvider: "mysql",
    summary: { tableCount, recordCount },
    tables,
  };
}
