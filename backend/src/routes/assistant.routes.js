import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { assistantLimiter } from "../middleware/rateLimit.middleware.js";
import { chatWithAssistant } from "../controllers/assistant.controller.js";

const router = Router();

router.post(
  "/chat",
  authMiddleware,
  requireRole("citizen", "department", "admin"),
  assistantLimiter,
  chatWithAssistant
);

export default router;
