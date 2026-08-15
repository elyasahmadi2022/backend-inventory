import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { startBackupScheduler } from "./modules/settings/backup.service.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Backend API listening on port ${env.PORT}`);
  startBackupScheduler();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${env.PORT} is already in use. Stop the other process or set a different PORT in .env.`
    );
    process.exit(1);
  }

  throw error;
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
