import type { NextFunction, Response } from "express";
import { prisma } from "../../db/prisma.js";
import type { AuthRequest } from "../../types/auth.js";
import { AppError } from "../../utils/app-error.js";
import { verifyAccessToken } from "./auth.tokens.js";

export async function requireAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.header("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;

    if (!token) {
      throw new AppError(401, "Authentication token is required");
    }

    const payload = verifyAccessToken(token);
    if (!payload.sid) {
      throw new AppError(401, "Invalid authentication session");
    }

    const session = await prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true
      }
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new AppError(401, "Authentication session has expired or was revoked");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        },
        permissions: {
          include: { permission: true }
        }
      }
    });

    if (!user || user.status !== "active") {
      throw new AppError(401, "User is not active or does not exist");
    }

    const rolePermissions = user.roles.flatMap((userRole) =>
      userRole.role.permissions
        .filter((rolePermission) => rolePermission.effect === "allow")
        .map((rolePermission) => rolePermission.permission.key)
    );
    const directAllowed = user.permissions
      .filter((permission) => permission.effect === "allow")
      .map((permission) => permission.permission.key);
    const directDenied = new Set(
      user.permissions
        .filter((permission) => permission.effect === "deny")
        .map((permission) => permission.permission.key)
    );

    req.user = {
      id: user.id,
      sessionId: session.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((userRole) => userRole.role.name),
      permissions: [...new Set([...rolePermissions, ...directAllowed])].filter(
        (permission) => !directDenied.has(permission)
      )
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: string) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, "Authentication is required"));
      return;
    }

    if (!req.user.permissions.includes(permission)) {
      next(new AppError(403, `Missing permission: ${permission}`));
      return;
    }

    next();
  };
}
