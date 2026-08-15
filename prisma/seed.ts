import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { env } from "../src/config/env.js";
import { createPrismaMysqlAdapter } from "../src/db/prisma-adapter.js";

const adapter = createPrismaMysqlAdapter(env.DATABASE_URL);

const prisma = new PrismaClient({ adapter });

const permissionRows = [
  ["users.create", "Create users"],
  ["users.update", "Update users"],
  ["users.delete", "Delete users"],
  ["roles.manage", "Manage roles and permissions"],
  ["settings.manage", "Manage store settings"],
  ["accounts.manage", "Manage accounts"],
  ["partners.manage", "Manage customers, vendors, and sarafi partners"],
  ["products.manage", "Manage products and inventory"],
  ["journals.post", "Post daily journal entries"],
  ["journals.reverse", "Reverse journal entries"],
  ["sales.manage", "Manage sales invoices"],
  ["purchases.manage", "Manage purchase bills"],
  ["payments.manage", "Manage payments and money transfers"],
  ["reports.view", "View reports"],
  ["audit.view", "View audit logs"]
] as const;

const managerPermissionKeys = [
  "partners.manage",
  "products.manage",
  "journals.post",
  "journals.reverse",
  "sales.manage",
  "purchases.manage",
  "payments.manage",
  "reports.view"
];

const staffPermissionKeys = [
  "products.manage",
  "sales.manage",
  "payments.manage",
  "reports.view"
];

const adminSeedUser = {
  code: "USR-ADMIN",
  fullName: process.env.SEED_ADMIN_FULL_NAME?.trim() || "System Administrator",
  username: process.env.SEED_ADMIN_USERNAME?.trim() || "admin",
  email: process.env.SEED_ADMIN_EMAIL?.trim() || "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD?.trim() || "Admin@123"
};

type SeedAccount = {
  code: string;
  name: string;
  category: "asset" | "liability" | "equity" | "revenue" | "expense";
  type:
    | "cash"
    | "bank"
    | "sarafi"
    | "daskhil"
    | "accounts_receivable"
    | "accounts_payable"
    | "inventory"
    | "cost_of_goods_sold"
    | "sales_revenue"
    | "purchase"
    | "expense"
    | "equity"
    | "liability"
    | "exchange_gain"
    | "exchange_loss"
    | "other";
  normalBalance: "debit" | "credit";
  parentCode?: string;
  isControlAccount?: boolean;
  currencyCode: "AFN" | "USD" | "PKR";
};

type SeedAccountTemplate = Omit<SeedAccount, "code" | "name" | "parentCode" | "currencyCode"> & {
  baseCode: string;
  baseName: string;
  parentBaseCode?: string;
};

const currencyVariants = [
  { code: "AFN" as const, suffix: "1", label: "افغانی" },
  { code: "USD" as const, suffix: "2", label: "دالر" },
  { code: "PKR" as const, suffix: "3", label: "کلدار" },
];

const accountSeedTemplates: SeedAccountTemplate[] = [
  { baseCode: "1000", baseName: "دارایی ها", category: "asset", type: "other", normalBalance: "debit", isControlAccount: true },
  { baseCode: "1100", baseName: "دارایی های جاری", category: "asset", type: "other", normalBalance: "debit", parentBaseCode: "1000", isControlAccount: true },
  { baseCode: "1110", baseName: "حسابهای نقدی", category: "asset", type: "cash", normalBalance: "debit", parentBaseCode: "1100" },
  { baseCode: "1120", baseName: "حسابهای بانکی", category: "asset", type: "bank", normalBalance: "debit", parentBaseCode: "1100" },
  { baseCode: "1130", baseName: "حسابهای صرافی", category: "asset", type: "sarafi", normalBalance: "debit", parentBaseCode: "1100" },
  { baseCode: "1140", baseName: "حسابهای دخل", category: "asset", type: "daskhil", normalBalance: "debit", parentBaseCode: "1100" },
  { baseCode: "1150", baseName: "حسابهای دریافتنی", category: "asset", type: "accounts_receivable", normalBalance: "debit", parentBaseCode: "1100", isControlAccount: true },
  { baseCode: "1160", baseName: "حسابهای موجودی کالا", category: "asset", type: "inventory", normalBalance: "debit", parentBaseCode: "1100", isControlAccount: true },
  { baseCode: "1200", baseName: "دارایی های غیر جاری", category: "asset", type: "other", normalBalance: "debit", parentBaseCode: "1000", isControlAccount: true },
  { baseCode: "1210", baseName: "حسابهای تجهیزات", category: "asset", type: "other", normalBalance: "debit", parentBaseCode: "1200" },
  { baseCode: "2000", baseName: "بدهی ها", category: "liability", type: "liability", normalBalance: "credit", isControlAccount: true },
  { baseCode: "2100", baseName: "بدهی های جاری", category: "liability", type: "liability", normalBalance: "credit", parentBaseCode: "2000", isControlAccount: true },
  { baseCode: "2110", baseName: "حسابهای پرداختنی", category: "liability", type: "accounts_payable", normalBalance: "credit", parentBaseCode: "2100", isControlAccount: true },
  { baseCode: "2120", baseName: "مصارف پرداختنی", category: "liability", type: "liability", normalBalance: "credit", parentBaseCode: "2100" },
  { baseCode: "3000", baseName: "سرمایه", category: "equity", type: "equity", normalBalance: "credit", isControlAccount: true },
  { baseCode: "3100", baseName: "سرمایه مالک", category: "equity", type: "equity", normalBalance: "credit", parentBaseCode: "3000" },
  { baseCode: "3200", baseName: "برداشت مالک", category: "equity", type: "equity", normalBalance: "debit", parentBaseCode: "3000" },
  { baseCode: "4000", baseName: "درآمد ها", category: "revenue", type: "other", normalBalance: "credit", isControlAccount: true },
  { baseCode: "4100", baseName: "حسابهای درآمد فروش", category: "revenue", type: "sales_revenue", normalBalance: "credit", parentBaseCode: "4000", isControlAccount: true },
  { baseCode: "4200", baseName: "سود تفاوت اسعار", category: "revenue", type: "exchange_gain", normalBalance: "credit", parentBaseCode: "4000" },
  { baseCode: "5000", baseName: "مصارف", category: "expense", type: "expense", normalBalance: "debit", isControlAccount: true },
  { baseCode: "5100", baseName: "بهای تمام شده کالای فروش رفته", category: "expense", type: "cost_of_goods_sold", normalBalance: "debit", parentBaseCode: "5000", isControlAccount: true },
  { baseCode: "5200", baseName: "حسابهای خرید", category: "expense", type: "purchase", normalBalance: "debit", parentBaseCode: "5000" },
  { baseCode: "5300", baseName: "مصارف عملیاتی", category: "expense", type: "expense", normalBalance: "debit", parentBaseCode: "5000", isControlAccount: true },
  { baseCode: "5310", baseName: "حسابهای کرایه", category: "expense", type: "expense", normalBalance: "debit", parentBaseCode: "5300" },
  { baseCode: "5320", baseName: "حسابهای معاشات", category: "expense", type: "expense", normalBalance: "debit", parentBaseCode: "5300" },
  { baseCode: "5330", baseName: "حسابهای برق و آب", category: "expense", type: "expense", normalBalance: "debit", parentBaseCode: "5300" },
  { baseCode: "5400", baseName: "زیان تفاوت اسعار", category: "expense", type: "exchange_loss", normalBalance: "debit", parentBaseCode: "5000" },
];

const accountSeedRows: SeedAccount[] = accountSeedTemplates.flatMap((template) =>
  currencyVariants.map((currency) => ({
    code: `${template.baseCode}${currency.suffix}`,
    name: `${template.baseName} ${currency.label}`,
    category: template.category,
    type: template.type,
    normalBalance: template.normalBalance,
    parentCode: template.parentBaseCode
      ? `${template.parentBaseCode}${currency.suffix}`
      : undefined,
    isControlAccount: template.isControlAccount,
    currencyCode: currency.code,
  })),
);

async function upsertSeedAccount(account: SeedAccount) {
  const parent = account.parentCode
    ? await prisma.account.findUnique({
        where: { code: account.parentCode },
        select: { id: true }
      })
    : null;

  await prisma.account.upsert({
    where: { code: account.code },
    create: {
      code: account.code,
      name: account.name,
      category: account.category,
      type: account.type,
      normalBalance: account.normalBalance,
      currencyCode: account.currencyCode,
      parentId: parent?.id,
      isControlAccount: account.isControlAccount ?? false,
      isActive: true
    },
    update: {
      name: account.name,
      category: account.category,
      type: account.type,
      normalBalance: account.normalBalance,
      currencyCode: account.currencyCode,
      parentId: parent?.id ?? null,
      isControlAccount: account.isControlAccount ?? false,
      isActive: true
    }
  });
}

async function upsertAdminUser(adminRoleId: string) {
  const passwordHash = await bcrypt.hash(adminSeedUser.password, 12);

  const user = await prisma.user.upsert({
    where: { username: adminSeedUser.username },
    create: {
      code: adminSeedUser.code,
      fullName: adminSeedUser.fullName,
      username: adminSeedUser.username,
      email: adminSeedUser.email,
      passwordHash,
      status: "active"
    },
    update: {
      code: adminSeedUser.code,
      fullName: adminSeedUser.fullName,
      email: adminSeedUser.email,
      passwordHash,
      status: "active"
    },
    select: { id: true, username: true }
  });

  await prisma.userRole.deleteMany({
    where: { userId: user.id }
  });

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: adminRoleId
    }
  });

  return user;
}

async function main() {
  await prisma.currency.createMany({
    data: [
      { code: "AFN", name: "Afghani", symbol: "؋", isBase: true },
      { code: "USD", name: "US Dollar", symbol: "$" },
      { code: "PKR", name: "Pakistani Rupee", symbol: "Rs" }
    ],
    skipDuplicates: true
  });

  await prisma.role.createMany({
    data: [
      { name: "admin", description: "Full system access" },
      { name: "manager", description: "Store management access" },
      { name: "staff", description: "Limited daily operation access" }
    ],
    skipDuplicates: true
  });

  await prisma.permission.createMany({
    data: permissionRows.map(([key, description]) => ({ key, description })),
    skipDuplicates: true
  });

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: "admin" }
  });
  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "manager" }
  });
  const staffRole = await prisma.role.findUniqueOrThrow({
    where: { name: "staff" }
  });
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(
    permissions.map((permission) => [permission.key, permission])
  );

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: {
        in: [adminRole.id, managerRole.id, staffRole.id]
      }
    }
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: adminRole.id,
      permissionId: permission.id
    })),
    skipDuplicates: true
  });

  await prisma.rolePermission.createMany({
    data: managerPermissionKeys.map((key) => ({
      roleId: managerRole.id,
      permissionId: permissionByKey.get(key)!.id
    })),
    skipDuplicates: true
  });

  await prisma.rolePermission.createMany({
    data: staffPermissionKeys.map((key) => ({
      roleId: staffRole.id,
      permissionId: permissionByKey.get(key)!.id
    })),
    skipDuplicates: true
  });

  for (const account of accountSeedRows) {
    await upsertSeedAccount(account);
  }

  const adminUser = await upsertAdminUser(adminRole.id);

  console.log(
    `Seeded admin user: ${adminUser.username} / ${adminSeedUser.password}`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
