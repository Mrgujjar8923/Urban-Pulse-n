import { Router } from "express";
import {
  clearNotifications,
  listNotifications,
  markAllNotificationsRead,
  updateNotificationReadState,
} from "../controllers/notification.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, listNotifications);
router.put("/read-all", authMiddleware, markAllNotificationsRead);
router.delete("/clear", authMiddleware, clearNotifications);
router.put("/:id/read", authMiddleware, updateNotificationReadState);

export default router;
