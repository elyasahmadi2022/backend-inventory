import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp, isAllowedOrigin } from "../src/app.js";

const app = createApp();

function setVercelCorsHeaders(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;

  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    typeof req.headers["access-control-request-headers"] === "string"
      ? req.headers["access-control-request-headers"]
      : "Content-Type, Authorization",
  );
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  setVercelCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  return app(req, res);
}
