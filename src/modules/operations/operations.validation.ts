import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.validation.js";

export const listOperationsQuerySchema = z.object({
  ...paginationQuerySchema,
  kind: z.enum(["payment", "transfer"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export type ListOperationsQuery = z.infer<typeof listOperationsQuerySchema>;
