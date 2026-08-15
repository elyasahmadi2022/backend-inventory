import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import {
  cancelPurchase,
  createPurchase,
  getPurchase,
  getPurchaseByNumber,
  listPurchases,
  payPurchaseBill,
  returnPurchaseProducts,
  updatePurchase
} from "./purchases.model.js";
import type { ListPurchasesQuery } from "./purchases.validation.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listPurchasesController = asyncHandler(async (req, res) => {
  res.json(await listPurchases(typedQuery<ListPurchasesQuery>(req)));
});

export const getPurchaseController = asyncHandler(async (req, res) => {
  res.json(await getPurchase(routeId(req.params.id)));
});

export const getPurchaseByNumberController = asyncHandler(async (req, res) => {
  res.json(await getPurchaseByNumber(routeId(req.params.number)));
});

export const createPurchaseController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await createPurchase(req.body, req.user?.id));
  }
);

export const updatePurchaseController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await updatePurchase(routeId(req.params.id), req.body, req.user?.id));
  }
);

export const cancelPurchaseController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await cancelPurchase(routeId(req.params.id), req.user?.id));
  }
);

export const payPurchaseBillController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res
      .status(201)
      .json(await payPurchaseBill(routeId(req.params.id), req.body, req.user?.id));
  }
);

export const returnPurchaseProductsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res
      .status(201)
      .json(
        await returnPurchaseProducts(routeId(req.params.id), req.body, req.user?.id)
      );
  }
);
