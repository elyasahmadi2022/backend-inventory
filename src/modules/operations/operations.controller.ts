import { asyncHandler } from "../../utils/async-handler.js";
import { typedQuery } from "../../utils/request.js";
import { listOperations } from "./operations.model.js";
import type { ListOperationsQuery } from "./operations.validation.js";

export const listOperationsController = asyncHandler(async (req, res) => {
  res.json(await listOperations(typedQuery<ListOperationsQuery>(req)));
});
