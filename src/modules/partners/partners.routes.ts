import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";
import {
  createPartnerController,
  createPartnerLedgerAccountController,
  deletePartnerController,
  getPartnerController,
  getPartnerByCodeController,
  listPartnersController,
  recordPartnerPaymentController,
  updatePartnerController,
} from "./partners.controller.js";
import {
  createPartnerLedgerAccountSchema,
  createPartnerSchema,
  listPartnersQuerySchema,
  partnerCodeParamsSchema,
  partnerIdParamsSchema,
  recordPartnerPaymentSchema,
  updatePartnerSchema,
} from "./partners.validation.js";

export const partnersRouter = Router();

partnersRouter.use(requireAuth);
partnersRouter.use(requirePermission("partners.manage"));

partnersRouter.get(
  "/",
  validate({ query: listPartnersQuerySchema }),
  listPartnersController,
);
partnersRouter.post(
  "/",
  validate({ body: createPartnerSchema }),
  createPartnerController,
);
partnersRouter.get(
  "/code/:code",
  validate({ params: partnerCodeParamsSchema }),
  getPartnerByCodeController,
);
partnersRouter.get(
  "/:id",
  validate({ params: partnerIdParamsSchema }),
  getPartnerController,
);
partnersRouter.patch(
  "/:id",
  validate({ params: partnerIdParamsSchema, body: updatePartnerSchema }),
  updatePartnerController,
);
partnersRouter.delete(
  "/:id",
  validate({ params: partnerIdParamsSchema }),
  deletePartnerController,
);
partnersRouter.post(
  "/:id/ledger-accounts",
  validate({
    params: partnerIdParamsSchema,
    body: createPartnerLedgerAccountSchema,
  }),
  createPartnerLedgerAccountController,
);
partnersRouter.post(
  "/:id/payments",
  validate({ params: partnerIdParamsSchema, body: recordPartnerPaymentSchema }),
  recordPartnerPaymentController,
);
