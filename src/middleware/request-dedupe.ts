import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../types/auth.js";

type CachedResponse = {
  kind: "completed";
  createdAt: number;
  statusCode: number;
  body: unknown;
};

type PendingResponse = {
  kind: "pending";
  createdAt: number;
};

type DedupeEntry = CachedResponse | PendingResponse;

const REQUEST_DEDUPE_TTL_MS = 10_000;
const requestCache = new Map<string, DedupeEntry>();

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of requestCache.entries()) {
    if (now - entry.createdAt > REQUEST_DEDUPE_TTL_MS) {
      requestCache.delete(key);
    }
  }
}

function buildRequestFingerprint(req: Request): string {
  const actor = (req as AuthRequest).user?.id ?? req.ip;
  const payload = stableStringify(req.body ?? {});
  return createHash("sha256")
    .update(`${actor}|${req.method}|${req.originalUrl}|${payload}`)
    .digest("hex");
}

export function requestDedupe(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") {
    next();
    return;
  }

  const now = Date.now();
  cleanupExpiredEntries(now);

  const fingerprint = buildRequestFingerprint(req);
  const existing = requestCache.get(fingerprint);

  if (existing?.kind === "pending") {
    res.status(409).json({
      message:
        "An identical request is already being processed. Please wait a moment before trying again."
    });
    return;
  }

  if (existing?.kind === "completed") {
    res.setHeader("X-Idempotency-Status", "replayed");
    res.status(existing.statusCode).json(existing.body);
    return;
  }

  requestCache.set(fingerprint, {
    kind: "pending",
    createdAt: now
  });

  let responseBody: unknown;
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      requestCache.set(fingerprint, {
        kind: "completed",
        createdAt: Date.now(),
        statusCode: res.statusCode,
        body: responseBody
      });
      return;
    }

    requestCache.delete(fingerprint);
  });

  res.on("close", () => {
    const current = requestCache.get(fingerprint);
    if (current?.kind === "pending") {
      requestCache.delete(fingerprint);
    }
  });

  next();
}
