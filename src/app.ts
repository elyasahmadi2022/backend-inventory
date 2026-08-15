import cors from "cors";
import express from "express";
import morgan from "morgan";
import { createRequire } from "node:module";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { requestDedupe } from "./middleware/request-dedupe.js";
import { uploadRoot } from "./middleware/upload.js";
import { accountsRouter } from "./modules/accounts/accounts.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { currenciesRouter } from "./modules/currencies/currencies.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { journalsRouter } from "./modules/journals/journals.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { operationsRouter } from "./modules/operations/operations.routes.js";
import { partnersRouter } from "./modules/partners/partners.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { purchasesRouter } from "./modules/purchases/purchases.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { salesRouter } from "./modules/sales/sales.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { transfersRouter } from "./modules/transfers/transfers.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

const require = createRequire(import.meta.url);
const helmet = require("helmet") as typeof import("helmet").default;

const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGINS,
]
  .flatMap((origin) => origin?.split(",") ?? [])
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

export function isAllowedOrigin(origin: string) {
  const normalizedOrigin = origin.replace(/\/$/, "");

  return (
    allowedOrigins.includes(normalizedOrigin) ||
    /^https:\/\/project-battery-system-management-[a-z0-9-]+\.vercel\.app$/i.test(
      normalizedOrigin,
    )
  );
}

export function setCorsHeaders(req: express.Request, res: express.Response) {
  const origin = req.header("origin");

  if (origin && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
  }
}

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    console.log(req.method, req.originalUrl);
    next();
  });
  app.use((req, res, next) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.header(
        "Access-Control-Allow-Methods",
        "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        req.header("access-control-request-headers") ??
          "Content-Type, Authorization",
      );
      res.sendStatus(204);
      return;
    }

    next();
  });
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }

        callback(null, isAllowedOrigin(origin));
      },
      optionsSuccessStatus: 204,
    }),
  );
  app.use(express.json());
  app.use(requestDedupe);
  app.use(morgan("dev"));
  app.use("/uploads", express.static(uploadRoot));

  app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/currencies", currenciesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/partners", partnersRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/purchases", purchasesRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/journals", journalsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/operations", operationsRouter);
  app.use("/api/transfers", transfersRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/settings", settingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp();
