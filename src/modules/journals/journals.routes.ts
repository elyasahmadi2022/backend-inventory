import { Router } from "express";

export const journalsRouter = Router();

journalsRouter.get("/", (_req, res) => {
  res.status(501).json({
    message:
      "Daily operations and accounting journal endpoints will be implemented next."
  });
});
