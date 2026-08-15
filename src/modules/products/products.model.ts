import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import {
  decreaseInventoryBalance,
  increaseInventoryBalance
} from "../../utils/accounting.js";
import { nextEntityCode } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreateInventoryLocationInput,
  CreateInventoryTransferInput,
  CreateProductCategoryInput,
  CreateProductInput,
  CreateUnitInput,
  ListProductsQuery,
  UpdateProductCategoryInput,
  UpdateProductInput,
  UpdateUnitInput
} from "./products.validation.js";

const productInclude = {
  category: true,
  baseUnit: true,
  purchaseCurrency: true,
  saleCurrency: true,
  inventoryBalances: {
    include: {
      location: true
    }
  }
} satisfies Prisma.ProductInclude;

const inventoryMovementInclude = {
  lines: {
    include: {
      product: { select: { id: true, sku: true, name: true } },
      fromLocation: { select: { id: true, code: true, name: true, type: true } },
      toLocation: { select: { id: true, code: true, name: true, type: true } }
    },
    orderBy: { lineNo: "asc" }
  },
  createdBy: { select: { id: true, code: true, fullName: true, username: true } }
} satisfies Prisma.InventoryMovementInclude;

function mapUniqueError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(409, "A record with this unique value already exists");
  }

  throw error;
}

export async function listProducts(query: ListProductsQuery) {
  const pagination = getPagination(query);
  const where: Prisma.ProductWhereInput = {
    categoryId: query.categoryId,
    isActive: query.isActive,
    OR: query.search
      ? [
          { sku: { contains: query.search } },
          { barcode: { contains: query.search } },
          { name: { contains: query.search } }
        ]
      : undefined
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: productInclude
    }),
    prisma.product.count({ where })
  ]);

  return paginatedResponse(products, total, pagination.page, pagination.limit);
}

export async function getProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: productInclude
  });

  if (!product) {
    throw new AppError(404, "Product not found");
  }

  return { product };
}

export async function getProductByCode(code: string) {
  const product = await prisma.product.findUnique({
    where: { sku: code },
    include: productInclude
  });

  if (!product) {
    throw new AppError(404, "Product not found");
  }

  return { product };
}

export async function createProduct(input: CreateProductInput) {
  try {
    const product = await withTransaction(async (tx) => {
      const sku = input.sku ?? (await nextEntityCode(tx, "product"));

      return tx.product.create({
        data: { ...input, sku },
        include: productInclude
      });
    });

    return { product };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updateProduct(productId: string, input: UpdateProductInput) {
  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data: input,
      include: productInclude
    });

    return { product };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function listProductCategories() {
  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
    include: {
      parent: true,
      children: true
    }
  });

  return { categories };
}

export async function createProductCategory(input: CreateProductCategoryInput) {
  try {
    const category = await prisma.productCategory.create({
      data: input
    });

    return { category };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updateProductCategory(
  categoryId: string,
  input: UpdateProductCategoryInput
) {
  const category = await prisma.productCategory.update({
    where: { id: categoryId },
    data: input
  });

  return { category };
}

export async function listUnits() {
  const units = await prisma.unitOfMeasure.findMany({
    orderBy: { code: "asc" }
  });

  return { units };
}

export async function listInventoryLocations() {
  const locations = await prisma.inventoryLocation.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" }
  });

  return { locations };
}

export async function createInventoryLocation(input: CreateInventoryLocationInput) {
  try {
    const location = await withTransaction(async (tx) => {
      const code = input.code ?? (await nextEntityCode(tx, "inventoryLocation"));

      if (input.parentId) {
        const parent = await tx.inventoryLocation.findUnique({
          where: { id: input.parentId }
        });
        if (!parent?.isActive) {
          throw new AppError(400, "Parent inventory location must exist and be active");
        }
      }

      return tx.inventoryLocation.create({
        data: {
          code,
          name: input.name,
          type: input.type,
          parentId: input.parentId,
          isActive: input.isActive ?? true
        }
      });
    });

    return { location };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function createInventoryTransfer(
  input: CreateInventoryTransferInput,
  createdById?: string
) {
  const movement = await withTransaction(async (tx) => {
    const [product, fromLocation, toLocation] = await Promise.all([
      tx.product.findUnique({ where: { id: input.productId } }),
      tx.inventoryLocation.findUnique({ where: { id: input.fromLocationId } }),
      tx.inventoryLocation.findUnique({ where: { id: input.toLocationId } })
    ]);

    if (!product?.isActive) {
      throw new AppError(400, "Product must exist and be active");
    }

    if (!fromLocation?.isActive || !toLocation?.isActive) {
      throw new AppError(400, "Both inventory locations must exist and be active");
    }

    await decreaseInventoryBalance(
      tx,
      input.productId,
      input.fromLocationId,
      input.quantity
    );
    await increaseInventoryBalance(
      tx,
      input.productId,
      input.toLocationId,
      input.quantity
    );

    const unitCost = Number(product.standardCost ?? 0);
    const movementNumber = await nextEntityCode(tx, "inventoryMovement");

    return tx.inventoryMovement.create({
      data: {
        number: movementNumber,
        type: "transfer",
        status: "posted",
        movedAt: input.movedAt ?? new Date(),
        valueCurrencyCode: product.preferredPurchaseCurrency,
        totalValue: unitCost * input.quantity,
        reference: input.reference,
        notes: input.notes,
        createdById,
        lines: {
          create: {
            lineNo: 1,
            productId: input.productId,
            fromLocationId: input.fromLocationId,
            toLocationId: input.toLocationId,
            quantity: input.quantity,
            unitCost,
            lineValue: unitCost * input.quantity
          }
        }
      },
      include: inventoryMovementInclude
    });
  });

  return { movement };
}

export async function createUnit(input: CreateUnitInput) {
  try {
    const unit = await prisma.unitOfMeasure.create({
      data: input
    });

    return { unit };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updateUnit(unitId: string, input: UpdateUnitInput) {
  const unit = await prisma.unitOfMeasure.update({
    where: { id: unitId },
    data: input
  });

  return { unit };
}
