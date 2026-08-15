import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  changeUserPasswordController,
  createPermissionController,
  createRoleController,
  createUserController,
  deleteUserController,
  getUserByCodeController,
  getUserController,
  listPermissionsController,
  listRolesController,
  listUsersController,
  updatePermissionController,
  updateRoleController,
  updateUserController
} from "./users.controller.js";
import {
  changePasswordSchema,
  createPermissionSchema,
  createRoleSchema,
  createUserSchema,
  listUsersQuerySchema,
  permissionIdParamsSchema,
  roleIdParamsSchema,
  updatePermissionSchema,
  updateRoleSchema,
  updateUserSchema,
  userCodeParamsSchema,
  userIdParamsSchema
} from "./users.validation.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/permissions", requirePermission("roles.manage"), listPermissionsController);
usersRouter.post(
  "/permissions",
  requirePermission("roles.manage"),
  validate({ body: createPermissionSchema }),
  createPermissionController
);
usersRouter.patch(
  "/permissions/:id",
  requirePermission("roles.manage"),
  validate({ params: permissionIdParamsSchema, body: updatePermissionSchema }),
  updatePermissionController
);
usersRouter.get("/roles", requirePermission("roles.manage"), listRolesController);
usersRouter.post(
  "/roles",
  requirePermission("roles.manage"),
  validate({ body: createRoleSchema }),
  createRoleController
);
usersRouter.patch(
  "/roles/:id",
  requirePermission("roles.manage"),
  validate({ params: roleIdParamsSchema, body: updateRoleSchema }),
  updateRoleController
);
usersRouter.get(
  "/",
  requirePermission("users.update"),
  validate({ query: listUsersQuerySchema }),
  listUsersController
);
usersRouter.post(
  "/",
  requirePermission("users.create"),
  validate({ body: createUserSchema }),
  createUserController
);
usersRouter.get(
  "/code/:code",
  requirePermission("users.update"),
  validate({ params: userCodeParamsSchema }),
  getUserByCodeController
);
usersRouter.get(
  "/:id",
  requirePermission("users.update"),
  validate({ params: userIdParamsSchema }),
  getUserController
);
usersRouter.patch(
  "/:id",
  requirePermission("users.update"),
  validate({ params: userIdParamsSchema, body: updateUserSchema }),
  updateUserController
);
usersRouter.patch(
  "/:id/password",
  requirePermission("users.update"),
  validate({ params: userIdParamsSchema, body: changePasswordSchema }),
  changeUserPasswordController
);
usersRouter.delete(
  "/:id",
  requirePermission("users.delete"),
  validate({ params: userIdParamsSchema }),
  deleteUserController
);
