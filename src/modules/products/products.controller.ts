import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import type { ListProductsQuery } from "./products.validation.js";
import {
  createInventoryLocation,
  createInventoryTransfer,
  createProduct,
  createProductCategory,
  createUnit,
  getProduct,
  getProductByCode,
  listInventoryLocations,
  listProductCategories,
  listProducts,
  listUnits,
  updateProduct,
  updateProductCategory,
  updateUnit
} from "./products.model.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listProductsController = asyncHandler(async (req, res) => {
  res.json(await listProducts(typedQuery<ListProductsQuery>(req)));
});

export const getProductController = asyncHandler(async (req, res) => {
  res.json(await getProduct(routeId(req.params.id)));
});

export const getProductByCodeController = asyncHandler(async (req, res) => {
  res.json(await getProductByCode(routeId(req.params.code)));
});

export const createProductController = asyncHandler(async (req, res) => {
  res.status(201).json(await createProduct(req.body));
});

export const updateProductController = asyncHandler(async (req, res) => {
  res.json(await updateProduct(routeId(req.params.id), req.body));
});

export const listProductCategoriesController = asyncHandler(async (_req, res) => {
  res.json(await listProductCategories());
});

export const createProductCategoryController = asyncHandler(async (req, res) => {
  res.status(201).json(await createProductCategory(req.body));
});

export const updateProductCategoryController = asyncHandler(async (req, res) => {
  res.json(await updateProductCategory(routeId(req.params.id), req.body));
});

export const listUnitsController = asyncHandler(async (_req, res) => {
  res.json(await listUnits());
});

export const listInventoryLocationsController = asyncHandler(async (_req, res) => {
  res.json(await listInventoryLocations());
});

export const createInventoryLocationController = asyncHandler(async (req, res) => {
  res.status(201).json(await createInventoryLocation(req.body));
});

export const createInventoryTransferController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await createInventoryTransfer(req.body, req.user?.id));
  }
);

export const createUnitController = asyncHandler(async (req, res) => {
  res.status(201).json(await createUnit(req.body));
});

export const updateUnitController = asyncHandler(async (req, res) => {
  res.json(await updateUnit(routeId(req.params.id), req.body));
});
