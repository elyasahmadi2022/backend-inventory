import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

export const listUsersQuerySchema = z.object({
  ...paginationQuerySchema,
  status: z.enum(["active", "disabled"]).optional()
});

export const userIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const userCodeParamsSchema = z.object({
  code: z.string().trim().min(2).max(30)
});

export const createUserSchema = z.object({
  code: z.string().trim().min(2).max(30).optional(),
  fullName: z.string().trim().min(2),
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8),
  roleNames: z.array(z.enum(["admin", "manager", "staff"])).min(1)
});

export const updateUserSchema = z.object({
  code: z.string().trim().min(2).max(30).optional(),
  fullName: z.string().trim().min(2).optional(),
  username: z.string().trim().min(3).max(50).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  roleNames: z.array(z.enum(["admin", "manager", "staff"])).min(1).optional()
});

export const changePasswordSchema = z.object({
  password: z.string().min(8)
});

export const roleIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const permissionIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const permissionEffectSchema = z.enum(["allow", "deny"]);

export const rolePermissionInputSchema = z.object({
  key: z.string().trim().min(2).max(100),
  effect: permissionEffectSchema.default("allow")
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(rolePermissionInputSchema).default([])
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(rolePermissionInputSchema).optional()
});

export const createPermissionSchema = z.object({
  key: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).nullable().optional()
});

export const updatePermissionSchema = z.object({
  key: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(300).nullable().optional()
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
