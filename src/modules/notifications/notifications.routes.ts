import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Notifications loaded",
    status: 200,
    data: {
      notifications: [],
      unreadCount: 0,
      pagination: { page: 1, pageSize: 0, total: 0, totalPages: 0 }
    }
  });
});

notificationsRouter.get("/unread-count", (_req, res) => {
  res.json({
    success: true,
    message: "Unread notification count loaded",
    status: 200,
    data: { unreadCount: 0 }
  });
});

notificationsRouter.get("/:id", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Notification ${req.params.id} was not found`,
    status: 404
  });
});

notificationsRouter.patch("/:id/read", (_req, res) => {
  res.json({
    success: true,
    message: "Notification marked as read",
    status: 200
  });
});

notificationsRouter.patch("/read-all", (_req, res) => {
  res.json({
    success: true,
    message: "Notifications marked as read",
    status: 200
  });
});
