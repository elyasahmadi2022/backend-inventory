import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  requireAuth,
  requirePermission
} from "../auth/auth.middleware.js";
import {
  createInventoryLocationController,
  createInventoryTransferController,
  createProductCategoryController,
  createProductController,
  createUnitController,
  getProductController,
  getProductByCodeController,
  listProductCategoriesController,
  listInventoryLocationsController,
  listProductsController,
  listUnitsController,
  updateProductCategoryController,
  updateProductController,
  updateUnitController
} from "./products.controller.js";
import {
  categoryIdParamsSchema,
  createProductCategorySchema,
  createInventoryLocationSchema,
  createInventoryTransferSchema,
  createProductSchema,
  createUnitSchema,
  listProductsQuerySchema,
  productCodeParamsSchema,
  productIdParamsSchema,
  unitIdParamsSchema,
  updateProductCategorySchema,
  updateProductSchema,
  updateUnitSchema
} from "./products.validation.js";

export const productsRouter = Router();

productsRouter.use(requireAuth);
productsRouter.use(requirePermission("products.manage"));

productsRouter.get("/categories", listProductCategoriesController);
productsRouter.post(
  "/categories",
  validate({ body: createProductCategorySchema }),
  createProductCategoryController
);
productsRouter.patch(
  "/categories/:id",
  validate({ params: categoryIdParamsSchema, body: updateProductCategorySchema }),
  updateProductCategoryController
);

productsRouter.get("/units", listUnitsController);
productsRouter.post("/units", validate({ body: createUnitSchema }), createUnitController);
productsRouter.patch(
  "/units/:id",
  validate({ params: unitIdParamsSchema, body: updateUnitSchema }),
  updateUnitController
);

productsRouter.get("/locations", listInventoryLocationsController);
productsRouter.post(
  "/locations",
  validate({ body: createInventoryLocationSchema }),
  createInventoryLocationController
);
productsRouter.post(
  "/inventory-transfers",
  validate({ body: createInventoryTransferSchema }),
  createInventoryTransferController
);

productsRouter.get(
  "/",
  validate({ query: listProductsQuerySchema }),
  listProductsController
);
productsRouter.post("/", validate({ body: createProductSchema }), createProductController);
productsRouter.get(
  "/code/:code",
  validate({ params: productCodeParamsSchema }),
  getProductByCodeController
);
productsRouter.get(
  "/:id",
  validate({ params: productIdParamsSchema }),
  getProductController
);
productsRouter.patch(
  "/:id",
  validate({ params: productIdParamsSchema, body: updateProductSchema }),
  updateProductController
);
