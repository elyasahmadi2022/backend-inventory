import { PrismaClient } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { createPrismaMysqlAdapter } from "./prisma-adapter.js";

const adapter = createPrismaMysqlAdapter(env.DATABASE_URL);

export const prisma = new PrismaClient({ adapter });

export type PrismaTransaction = Prisma.TransactionClient;
