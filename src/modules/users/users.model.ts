import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  ChangePasswordInput,
  CreatePermissionInput,
  CreateRoleInput,
  CreateUserInput,
  ListUsersQuery,
  UpdatePermissionInput,
  UpdateRoleInput,
  UpdateUserInput
} from "./users.validation.js";

const userSelect = {
  id: true,
  code: true,
  fullName: true,
  username: true,
  email: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: { name: true, description: true }
      }
    }
  }
};

function toUserResponse(user: {
  id: string;
  code: string | null;
  fullName: string;
  username: string;
  email: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: { name: string; description: string | null } }[];
}) {
  return {
    id: user.id,
    code: user.code,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    status: user.status,
    roles: user.roles.map((userRole) => userRole.role),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function findRoles(roleNames: string[]) {
  const roles = await prisma.role.findMany({
    where: { name: { in: roleNames } }
  });

  if (roles.length !== roleNames.length) {
    throw new AppError(400, "One or more roles do not exist");
  }

  return roles;
}

export async function listUsers(query: ListUsersQuery) {
  const pagination = getPagination(query);
  const where = { status: query.status };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      select: userSelect
    }),
    prisma.user.count({ where })
  ]);

  return paginatedResponse(
    users.map(toUserResponse),
    total,
    pagination.page,
    pagination.limit
  );
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return { user: toUserResponse(user) };
}

export async function getUserByCode(code: string) {
  const user = await prisma.user.findUnique({
    where: { code },
    select: userSelect
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return { user: toUserResponse(user) };
}

export async function createUser(input: CreateUserInput) {
  const roles = await findRoles(input.roleNames);
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await withTransaction(async (tx) => {
      const code = input.code ?? (await nextEntityCode(tx, "user"));

      return tx.user.create({
        data: {
          code,
          fullName: input.fullName,
          username: input.username,
          email: input.email,
          passwordHash,
          roles: {
            create: roles.map((role) => ({
              roleId: role.id
            }))
          }
        },
        select: userSelect
      });
    });

    return { user: toUserResponse(user) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new AppError(409, "Username already exists");
    }

    throw error;
  }
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  if (Object.keys(input).length === 0) {
    throw new AppError(400, "No update fields were provided");
  }

  const roles = input.roleNames ? await findRoles(input.roleNames) : undefined;

  const user = await withTransaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!existingUser) {
      throw new AppError(404, "User not found");
    }

    if (roles) {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({
          userId,
          roleId: role.id
        }))
      });
    }

    return tx.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        code: input.code,
        username: input.username,
        email: input.email,
        status: input.status
      },
      select: userSelect
    });
  });

  return { user: toUserResponse(user) };
}

export async function changeUserPassword(
  userId: string,
  input: ChangePasswordInput
) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
    select: userSelect
  });

  return { user: toUserResponse(user) };
}

export async function deleteUser(userId: string) {
  const user = await withTransaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!existingUser) {
      throw new AppError(404, "User not found");
    }

    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return tx.user.update({
      where: { id: userId },
      data: { status: "disabled" },
      select: userSelect
    });
  });

  return { user: toUserResponse(user) };
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: {
        include: { permission: true }
      }
    }
  });

  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rolePermission) => ({
        key: rolePermission.permission.key,
        description: rolePermission.permission.description,
        effect: rolePermission.effect
      }))
    }))
  };
}

export async function listPermissions() {
  const permissions = await prisma.permission.findMany({
    orderBy: { key: "asc" }
  });

  return {
    permissions: permissions.map((permission) => ({
      id: permission.id,
      key: permission.key,
      description: permission.description
    }))
  };
}

export async function createPermission(input: CreatePermissionInput) {
  try {
    const permission = await prisma.permission.create({
      data: {
        key: input.key,
        description: input.description
      }
    });

    return {
      permission: {
        id: permission.id,
        key: permission.key,
        description: permission.description
      }
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new AppError(409, "Permission already exists");
    }

    throw error;
  }
}

export async function updatePermission(
  permissionId: string,
  input: UpdatePermissionInput
) {
  if (Object.keys(input).length === 0) {
    throw new AppError(400, "No update fields were provided");
  }

  try {
    const permission = await prisma.permission.update({
      where: { id: permissionId },
      data: {
        key: input.key,
        description: input.description
      }
    });

    return {
      permission: {
        id: permission.id,
        key: permission.key,
        description: permission.description
      }
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update")) {
      throw new AppError(404, "Permission not found");
    }
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new AppError(409, "Permission key already exists");
    }

    throw error;
  }
}

async function findPermissions(keys: string[]) {
  if (keys.length === 0) return [];

  const permissions = await prisma.permission.findMany({
    where: { key: { in: keys } }
  });

  if (permissions.length !== new Set(keys).size) {
    throw new AppError(400, "One or more permissions do not exist");
  }

  return permissions;
}

export async function createRole(input: CreateRoleInput) {
  const permissionKeys = input.permissions.map((permission) => permission.key);
  const permissions = await findPermissions(permissionKeys);
  const permissionByKey = new Map(
    permissions.map((permission) => [permission.key, permission])
  );

  try {
    const role = await withTransaction(async (tx) =>
      tx.role.create({
        data: {
          name: input.name,
          description: input.description,
          permissions: {
            create: input.permissions.map((item) => ({
              permissionId: permissionByKey.get(item.key)!.id,
              effect: item.effect
            }))
          }
        },
        include: {
          permissions: {
            include: { permission: true }
          }
        }
      })
    );

    return {
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((rolePermission) => ({
          key: rolePermission.permission.key,
          description: rolePermission.permission.description,
          effect: rolePermission.effect
        }))
      }
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new AppError(409, "Role already exists");
    }

    throw error;
  }
}

export async function updateRole(roleId: string, input: UpdateRoleInput) {
  if (Object.keys(input).length === 0) {
    throw new AppError(400, "No update fields were provided");
  }

  const permissionKeys = input.permissions?.map((permission) => permission.key) ?? [];
  const permissions = await findPermissions(permissionKeys);
  const permissionByKey = new Map(
    permissions.map((permission) => [permission.key, permission])
  );

  const role = await withTransaction(async (tx) => {
    const existingRole = await tx.role.findUnique({
      where: { id: roleId },
      select: { id: true }
    });

    if (!existingRole) {
      throw new AppError(404, "Role not found");
    }

    if (input.permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (input.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((item) => ({
            roleId,
            permissionId: permissionByKey.get(item.key)!.id,
            effect: item.effect
          }))
        });
      }
    }

    return tx.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        description: input.description
      },
      include: {
        permissions: {
          include: { permission: true }
        }
      }
    });
  });

  return {
    role: {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rolePermission) => ({
        key: rolePermission.permission.key,
        description: rolePermission.permission.description,
        effect: rolePermission.effect
      }))
    }
  };
}
