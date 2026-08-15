import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import type { AuthRequest } from "../../types/auth.js";
import type { ListPartnersQuery } from "./partners.validation.js";
import {
  createPartner,
  createPartnerLedgerAccount,
  deletePartner,
  getPartner,
  getPartnerByCode,
  listPartners,
  recordPartnerPayment,
  updatePartner,
} from "./partners.model.js";

function routeId(id: string | string[]): string {
  return Array.isArray(id) ? id[0]! : id;
}

export const listPartnersController = asyncHandler(async (req, res) => {
  res.json(await listPartners(typedQuery<ListPartnersQuery>(req)));
});

export const getPartnerController = asyncHandler(async (req, res) => {
  res.json(await getPartner(routeId(req.params.id)));
});

export const getPartnerByCodeController = asyncHandler(async (req, res) => {
  res.json(await getPartnerByCode(routeId(req.params.code)));
});

export const createPartnerController = asyncHandler(async (req, res) => {
  res.status(201).json(await createPartner(req.body));
});

export const updatePartnerController = asyncHandler(async (req, res) => {
  res.json(await updatePartner(routeId(req.params.id), req.body));
});

export const deletePartnerController = asyncHandler(async (req, res) => {
  res.json(await deletePartner(routeId(req.params.id)));
});

export const createPartnerLedgerAccountController = asyncHandler(
  async (req, res) => {
    res
      .status(201)
      .json(await createPartnerLedgerAccount(routeId(req.params.id), req.body));
  },
);

export const recordPartnerPaymentController = asyncHandler(
  async (req: AuthRequest, res) => {
    res
      .status(201)
      .json(
        await recordPartnerPayment(
          routeId(req.params.id),
          req.body,
          req.user?.id,
        ),
      );
  },
);
