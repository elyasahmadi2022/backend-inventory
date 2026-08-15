import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import { adminDashboard } from "./dashboard.model.js";
import type { AdminDashboardQuery } from "./dashboard.validation.js";

export const adminDashboardController = asyncHandler(async (req, res) => {
  res.json({
    dashboard: await adminDashboard(typedQuery<AdminDashboardQuery>(req))
  });
});
