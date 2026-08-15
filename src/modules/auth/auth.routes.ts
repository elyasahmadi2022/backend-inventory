import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { imageUpload } from "../../middleware/upload.js";
import { requireAuth } from "./auth.middleware.js";
import {
  bootstrapAdminController,
  changeOwnPasswordController,
  forgotPasswordController,
  loginController,
  logoutAllController,
  logoutController,
  meController,
  refreshController,
  resetPasswordController,
  updateOwnProfileController
} from "./auth.controller.js";
import {
  bootstrapAdminSchema,
  changeOwnPasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  updateOwnProfileSchema
} from "./auth.validation.js";

export const authRouter = Router();

authRouter.post(
  "/bootstrap-admin",
  validate({ body: bootstrapAdminSchema }),
  bootstrapAdminController
);
authRouter.post("/login", validate({ body: loginSchema }), loginController);
authRouter.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  forgotPasswordController
);
authRouter.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  resetPasswordController
);
authRouter.post(
  "/refresh",
  validate({ body: refreshTokenSchema }),
  refreshController
);
authRouter.get("/me", requireAuth, meController);
authRouter.patch(
  "/me",
  requireAuth,
  imageUpload("profiles").single("profileImage"),
  validate({ body: updateOwnProfileSchema }),
  updateOwnProfileController
);
authRouter.patch(
  "/me/password",
  requireAuth,
  validate({ body: changeOwnPasswordSchema }),
  changeOwnPasswordController
);
authRouter.post(
  "/logout",
  requireAuth,
  validate({ body: logoutSchema }),
  logoutController
);
authRouter.post("/logout-all", requireAuth, logoutAllController);
