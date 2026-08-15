import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import {
  createRefreshToken,
  hashToken,
  signAccessToken
} from "./auth.tokens.js";
import type {
  BootstrapAdminInput,
  ChangeOwnPasswordInput,
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  ResetPasswordInput,
  UpdateOwnProfileInput
} from "./auth.validation.js";

const passwordResetTokens = new Map<
  string,
  { userId: string; expiresAt: Date }
>();

const userSelect = {
  id: true,
  code: true,
  fullName: true,
  username: true,
  email: true,
  profileImageUrl: true,
  status: true,
  lastLoginAt: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
          permissions: {
            select: {
              permission: {
                select: { key: true }
              },
              effect: true
            }
          }
        }
      }
    }
  },
  permissions: {
    select: {
      effect: true,
      permission: {
        select: { key: true }
      }
    }
  }
};

type UserForAuth = NonNullable<
  Awaited<ReturnType<typeof findUserForResponse>>
>;

function getEffectivePermissions(user: UserForAuth) {
  const roleAllowed = user.roles.flatMap((userRole) =>
    userRole.role.permissions
      .filter((permission) => permission.effect === "allow")
      .map((permission) => permission.permission.key)
  );
  const directAllowed = user.permissions
    .filter((permission) => permission.effect === "allow")
    .map((permission) => permission.permission.key);
  const directDenied = new Set(
    user.permissions
      .filter((permission) => permission.effect === "deny")
      .map((permission) => permission.permission.key)
  );

  return [...new Set([...roleAllowed, ...directAllowed])].filter(
    (permission) => !directDenied.has(permission)
  );
}

function toAuthUser(user: UserForAuth) {
  return {
    id: user.id,
    code: user.code,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    profileImageUrl: user.profileImageUrl,
    status: user.status,
    roles: user.roles.map((userRole) => userRole.role.name),
    permissions: getEffectivePermissions(user),
    lastLoginAt: user.lastLoginAt
  };
}

function tokenExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRES_IN_DAYS);
  return expiresAt;
}

function resetTokenExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);
  return expiresAt;
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function authPayload(user: UserForAuth, sessionId: string, refreshToken: string) {
  return {
    tokenType: "Bearer",
    accessToken: signAccessToken(user.id, sessionId),
    refreshToken,
    expiresIn: env.JWT_EXPIRES_IN,
    user: toAuthUser(user)
  };
}

async function findUserForResponse(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: userSelect
  });
}

async function issueAuthSession(
  user: UserForAuth,
  context?: { userAgent?: string; ipAddress?: string }
) {
  const refreshToken = createRefreshToken();
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress,
      expiresAt: tokenExpiresAt()
    }
  });

  return authPayload(user, session.id, refreshToken);
}

export async function login(
  input: LoginInput,
  context?: { userAgent?: string; ipAddress?: string }
) {
  const identifier = input.identifier.trim().toLowerCase();
  const userWithPassword = await prisma.user.findUnique({
    where: identifier.includes("@")
      ? { email: identifier }
      : { username: input.identifier },
    select: {
      ...userSelect,
      passwordHash: true
    }
  });

  if (!userWithPassword || userWithPassword.status !== "active") {
    throw new AppError(401, "Invalid username/email or password");
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    userWithPassword.passwordHash
  );

  if (!passwordMatches) {
    throw new AppError(401, "Invalid username/email or password");
  }

  const user = await prisma.user.update({
    where: { id: userWithPassword.id },
    data: { lastLoginAt: new Date() },
    select: userSelect
  });

  return issueAuthSession(user, context);
}

export async function bootstrapAdmin(
  input: BootstrapAdminInput,
  context?: { userAgent?: string; ipAddress?: string }
) {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    throw new AppError(403, "Initial admin already exists");
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: "admin" }
  });

  if (!adminRole) {
    throw new AppError(500, "Admin role is missing. Run database seed first.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await withTransaction(async (tx) => {
    const code = await nextEntityCode(tx, "user");

    return tx.user.create({
      data: {
        code,
        fullName: input.fullName,
        username: input.username,
        email: input.email,
        passwordHash,
        lastLoginAt: new Date(),
        roles: {
          create: {
            roleId: adminRole.id
          }
        }
      },
      select: userSelect
    });
  });

  return issueAuthSession(user, context);
}

export async function refreshAuthSession(input: RefreshTokenInput) {
  const currentHash = hashToken(input.refreshToken);
  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash: currentHash },
    include: {
      user: {
        select: userSelect
      }
    }
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== "active"
  ) {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  const nextRefreshToken = createRefreshToken();
  const updatedSession = await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(nextRefreshToken),
      expiresAt: tokenExpiresAt()
    }
  });

  return authPayload(session.user, updatedSession.id, nextRefreshToken);
}

export async function logout(
  userId: string,
  input: LogoutInput,
  sessionId?: string
) {
  if (input.refreshToken) {
    await prisma.authSession.updateMany({
      where: {
        userId,
        refreshTokenHash: hashToken(input.refreshToken),
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
  } else if (sessionId) {
    await prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
  }

  return { message: "Logged out successfully" };
}

export async function logoutAll(userId: string) {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  return { message: "All sessions logged out successfully" };
}

export async function getCurrentUser(userId: string) {
  const user = await findUserForResponse(userId);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return toAuthUser(user);
}

export async function changeOwnPassword(
  userId: string,
  input: ChangeOwnPasswordInput
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true }
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  const passwordMatches = await bcrypt.compare(
    input.currentPassword,
    user.passwordHash
  );

  if (!passwordMatches) {
    throw new AppError(400, "Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  await withTransaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  });

  return { message: "Password changed successfully. Please log in again." };
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, status: true }
  });

  if (user?.status === "active") {
    const token = crypto.randomBytes(32).toString("hex");
    passwordResetTokens.set(hashResetToken(token), {
      userId: user.id,
      expiresAt: resetTokenExpiresAt()
    });

    const baseUrl =
      process.env.FRONTEND_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    console.info(`Password reset link for ${user.email}: ${resetUrl}`);
  }

  return {
    message: "If an active account exists for this email, a reset link has been sent."
  };
}

export async function resetPassword(input: ResetPasswordInput) {
  const tokenHash = hashResetToken(input.token);
  const reset = passwordResetTokens.get(tokenHash);

  if (!reset || reset.expiresAt <= new Date()) {
    passwordResetTokens.delete(tokenHash);
    throw new AppError(400, "Invalid or expired password reset token");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await withTransaction(async (tx) => {
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash }
    });
    await tx.authSession.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  });
  passwordResetTokens.delete(tokenHash);

  return { message: "Password reset successfully. Please log in again." };
}

export async function updateOwnProfile(
  userId: string,
  input: UpdateOwnProfileInput,
  profileImageUrl?: string
) {
  if (Object.keys(input).length === 0 && !profileImageUrl) {
    throw new AppError(400, "No profile fields were provided");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: input.fullName,
      username: input.username,
      email: input.email,
      profileImageUrl
    },
    select: userSelect
  });

  return { user: toAuthUser(user) };
}
