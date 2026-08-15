import type { PrismaTransaction } from "../db/prisma.js";

const prefixes = {
  user: "USR",
  account: "ACC",
  product: "PRD",
  customer: "CUS",
  vendor: "VEN",
  partner: "PAR",
  sarafi: "SAR",
  staff: "STF",
  transfer: "TRF",
  journal: "JRN",
  sale: "SAL",
  purchase: "PUR",
  payment: "PAY",
  inventoryMovement: "MOV",
  inventoryLocation: "LOC"
} as const;

export type EntityCodeKey = keyof typeof prefixes;

export async function nextEntityCode(
  tx: PrismaTransaction,
  key: EntityCodeKey
) {
  const counter = await tx.entityCounter.upsert({
    where: { key },
    create: { key, current: 1 },
    update: { current: { increment: 1 } }
  });

  return `${prefixes[key]}-${String(counter.current).padStart(6, "0")}`;
}

export function partnerCodeKey(type: string): EntityCodeKey {
  if (type === "customer") return "customer";
  if (type === "vendor") return "vendor";
  if (type === "sarafi") return "sarafi";
  if (type === "staff") return "staff";
  return "partner";
}
