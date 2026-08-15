import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import {
  createTransfer,
  getTransfer,
  getTransferByNumber,
  listTransfers
} from "./transfers.model.js";
import type { ListTransfersQuery } from "./transfers.validation.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listTransfersController = asyncHandler(async (req, res) => {
  res.json(await listTransfers(typedQuery<ListTransfersQuery>(req)));
});

export const getTransferController = asyncHandler(async (req, res) => {
  res.json(await getTransfer(routeId(req.params.id)));
});

export const getTransferByNumberController = asyncHandler(async (req, res) => {
  res.json(await getTransferByNumber(routeId(req.params.number)));
});

export const createTransferController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await createTransfer(req.body, req.user?.id));
  }
);
