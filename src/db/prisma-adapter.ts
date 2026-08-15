import { PrismaMariaDb } from "@prisma/adapter-mariadb";

export function createPrismaMysqlAdapter(connectionString: string) {
  return new PrismaMariaDb(connectionString);
}
