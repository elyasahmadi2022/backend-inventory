import { Prisma } from "../generated/prisma/client.js";
import { prisma, type PrismaTransaction } from "./prisma.js";

export async function withTransaction<T>(
  callback: (client: PrismaTransaction) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: "Serializable" });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Transaction retry limit exceeded");
}
