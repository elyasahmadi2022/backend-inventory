import type { Request } from "express";

export function typedQuery<T>(req: Request): T {
  return req.query as T;
}
