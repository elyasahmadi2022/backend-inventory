import { asyncHandler } from "../../utils/async-handler.js";
import type { Response } from "express";
import type { AuthRequest } from "../../types/auth.js";
import { typedQuery } from "../../utils/request.js";
import type { ListAccountsQuery } from "./accounts.validation.js";
import {
  createAccount,
  deleteAccount,
  getAccount,
  getAccountByCode,
  listAccounts,
  recordFunding,
  recordExpense,
  updateAccount
} from "./accounts.model.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listAccountsController = asyncHandler(async (req, res) => {
  res.json(await listAccounts(typedQuery<ListAccountsQuery>(req)));
});

export const getAccountController = asyncHandler(async (req, res) => {
  res.json(await getAccount(routeId(req.params.id)));
});

export const getAccountByCodeController = asyncHandler(async (req, res) => {
  res.json(await getAccountByCode(routeId(req.params.code)));
});

export const createAccountController = asyncHandler(async (req, res) => {
  res.status(201).json(await createAccount(req.body));
});

export const updateAccountController = asyncHandler(async (req, res) => {
  res.json(await updateAccount(routeId(req.params.id), req.body));
});

export const deleteAccountController = asyncHandler(async (req, res) => {
  res.json(await deleteAccount(routeId(req.params.id)));
});

export const recordExpenseController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await recordExpense(req.body, req.user?.id));
  }
);

export const recordFundingController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    res.status(201).json(await recordFunding(req.body, req.user?.id));
  }
);
