import { z } from "zod";

const optionalDate = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.date().optional()
);

export const adminDashboardQuerySchema = z
  .object({
    from: optionalDate,
    to: optionalDate
  })
  .refine(
    (query) => !query.from || !query.to || query.from <= query.to,
    "The from date must be before the to date"
  );

export type AdminDashboardQuery = z.infer<typeof adminDashboardQuerySchema>;
