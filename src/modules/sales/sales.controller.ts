import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import {
  cancelSale,
  createSale,
  getSale,
  getSaleByNumber,
  listSales,
  receiveSalePayment,
  returnSaleProducts,
  updateSale
} from "./sales.model.js";
import type { ListSalesQuery } from "./sales.validation.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listSalesController = asyncHandler(async (req, res) => {
  res.json(await listSales(typedQuery<ListSalesQuery>(req)));
});

export const getSaleController = asyncHandler(async (req, res) => {
  res.json(await getSale(routeId(req.params.id)));
});

export const getSaleByNumberController = asyncHandler(async (req, res) => {
  res.json(await getSaleByNumber(routeId(req.params.number)));
});

export const createSaleController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await createSale(req.body, req.user?.id));
  }
);

export const updateSaleController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await updateSale(routeId(req.params.id), req.body, req.user?.id));
  }
);

export const cancelSaleController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.json(await cancelSale(routeId(req.params.id), req.user?.id));
  }
);

export const receiveSalePaymentController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res
      .status(201)
      .json(await receiveSalePayment(routeId(req.params.id), req.body, req.user?.id));
  }
);

export const returnSaleProductsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res
      .status(201)
      .json(await returnSaleProducts(routeId(req.params.id), req.body, req.user?.id));
  }
);
