import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1)
  })
  .refine((data) => data.identifier || data.username, {
    message: "Username or email is required",
    path: ["identifier"]
  })
  .transform((data) => ({
    identifier: data.identifier ?? data.username!,
    password: data.password
  }));

export const bootstrapAdminSchema = z.object({
  fullName: z.string().trim().min(2),
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20)
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8)
});

export const updateOwnProfileSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  username: z.string().trim().min(3).max(50).optional(),
  email: z.string().trim().email().toLowerCase().optional()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
