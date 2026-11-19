import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  getAdminOverviewStats,
  getAdminDepartmentPerformance,
  getAdminFeedback,
} from "../controllers/admin.controller.js";
import {
  getAdminAnalytics,
  getAdminAnalyticsTrends,
  getAdminAnalyticsDepartments,
  getAdminAnalyticsResolution,
  getAdminAnalyticsSla,
  getAdminAnalyticsPriority,
} from "../controllers/adminAnalytics.controller.js";

const router = Router();

router.get("/stats", authMiddleware, requireRole("admin"), getAdminOverviewStats);
router.get("/departments", authMiddleware, requireRole("admin"), getAdminDepartmentPerformance);
router.get("/feedback", authMiddleware, requireRole("admin"), getAdminFeedback);

// Phase 5B Advanced Admin Analytics
router.get("/analytics", authMiddleware, requireRole("admin"), getAdminAnalytics);
router.get("/analytics/trends", authMiddleware, requireRole("admin"), getAdminAnalyticsTrends);
router.get("/analytics/departments", authMiddleware, requireRole("admin"), getAdminAnalyticsDepartments);
router.get("/analytics/resolution", authMiddleware, requireRole("admin"), getAdminAnalyticsResolution);
router.get("/analytics/sla", authMiddleware, requireRole("admin"), getAdminAnalyticsSla);
router.get("/analytics/priority", authMiddleware, requireRole("admin"), getAdminAnalyticsPriority);

export default router;

