import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { publicUploadPath } from "../../middleware/upload.js";
import {
  bootstrapAdmin,
  changeOwnPassword,
  requestPasswordReset,
  getCurrentUser,
  login,
  logout,
  logoutAll,
  refreshAuthSession,
  resetPassword,
  updateOwnProfile
} from "./auth.model.js";

export const loginController = asyncHandler(async (req, res) => {
  res.json(
    await login(req.body, {
      userAgent: req.header("user-agent"),
      ipAddress: req.ip
    })
  );
});

export const bootstrapAdminController = asyncHandler(async (req, res) => {
  res.status(201).json(
    await bootstrapAdmin(req.body, {
      userAgent: req.header("user-agent"),
      ipAddress: req.ip
    })
  );
});

export const meController = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({
    user: await getCurrentUser(req.user!.id)
  });
});

export const refreshController = asyncHandler(async (req, res) => {
  res.json(await refreshAuthSession(req.body));
});

export const logoutController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await logout(req.user!.id, req.body, req.user!.sessionId));
  }
);

export const logoutAllController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await logoutAll(req.user!.id));
  }
);

export const changeOwnPasswordController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await changeOwnPassword(req.user!.id, req.body));
  }
);

export const forgotPasswordController = asyncHandler(async (req, res) => {
  res.json(await requestPasswordReset(req.body));
});

export const resetPasswordController = asyncHandler(async (req, res) => {
  res.json(await resetPassword(req.body));
});

export const updateOwnProfileController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(
      await updateOwnProfile(
        req.user!.id,
        req.body,
        publicUploadPath(req.file)
      )
    );
  }
);
