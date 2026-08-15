import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import type { ListUsersQuery } from "./users.validation.js";
import {
  changeUserPassword,
  createPermission,
  createRole,
  createUser,
  deleteUser,
  getUser,
  getUserByCode,
  listPermissions,
  listRoles,
  listUsers,
  updatePermission,
  updateRole,
  updateUser
} from "./users.model.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listUsersController = asyncHandler(async (_req, res) => {
  res.json(await listUsers(typedQuery<ListUsersQuery>(_req)));
});

export const getUserController = asyncHandler(async (req, res) => {
  res.json(await getUser(routeId(req.params.id)));
});

export const getUserByCodeController = asyncHandler(async (req, res) => {
  res.json(await getUserByCode(routeId(req.params.code)));
});

export const createUserController = asyncHandler(async (req, res) => {
  res.status(201).json(await createUser(req.body));
});

export const updateUserController = asyncHandler(async (req, res) => {
  res.json(await updateUser(routeId(req.params.id), req.body));
});

export const changeUserPasswordController = asyncHandler(async (req, res) => {
  res.json(await changeUserPassword(routeId(req.params.id), req.body));
});

export const deleteUserController = asyncHandler(async (req, res) => {
  res.json(await deleteUser(routeId(req.params.id)));
});

export const listRolesController = asyncHandler(async (_req, res) => {
  res.json(await listRoles());
});

export const listPermissionsController = asyncHandler(async (_req, res) => {
  res.json(await listPermissions());
});

export const createPermissionController = asyncHandler(async (req, res) => {
  res.status(201).json(await createPermission(req.body));
});

export const updatePermissionController = asyncHandler(async (req, res) => {
  res.json(await updatePermission(routeId(req.params.id), req.body));
});

export const createRoleController = asyncHandler(async (req, res) => {
  res.status(201).json(await createRole(req.body));
});

export const updateRoleController = asyncHandler(async (req, res) => {
  res.json(await updateRole(routeId(req.params.id), req.body));
});
