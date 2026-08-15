import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";

export type AuthTokenPayload = {
  sub: string;
  sid?: string;
};

export function signAccessToken(userId: string, sessionId?: string): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
  };

  return jwt.sign({ sub: userId, sid: sessionId }, env.JWT_SECRET, {
    ...options
  });
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, "Authentication token has expired");
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(401, "Authentication token is invalid");
    }

    throw error;
  }
}
