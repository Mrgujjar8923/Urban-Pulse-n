import { Router } from "express";
import { body, param } from "express-validator";
import {
  assignComplaint,
  createComplaint,
  getAllComplaints,
  getDepartmentComplaints,
  getMyAssignedComplaints,
  updateComplaintStatus,
  getMyComplaints,
  getComplaintById,
  getComplaintEvidence,
  getComplaintResolutionEvidence,
  deleteComplaint,
  retryComplaintAiAnalysis,
} from "../controllers/complaint.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { complaintUploadMiddleware } from "../middleware/upload.middleware.js";
import { complaintCreateLimiter } from "../middleware/rateLimit.middleware.js";
import { DEPARTMENTS } from "../models/User.js";
import { STATUS } from "../models/Complaint.js";

const router = Router();

router.get(
  "/",
  authMiddleware,
  requireRole("admin"),
  getAllComplaints
);

// Citizen creates complaint
router.post(
  "/",
  authMiddleware,
  requireRole("citizen"),
  complaintCreateLimiter,
  complaintUploadMiddleware,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("category").isIn(DEPARTMENTS).withMessage("Invalid category"),
    body("latitude").optional({ nullable: true, checkFalsy: true }).isNumeric().withMessage("Invalid latitude"),
    body("longitude").optional({ nullable: true, checkFalsy: true }).isNumeric().withMessage("Invalid longitude"),
  ],
  createComplaint
);

// Citizen gets own complaints
router.get(
  "/my",
  authMiddleware,
  requireRole("citizen"),
  getMyComplaints
);

// Department gets its complaints
router.get(
  "/department",
  authMiddleware,
  requireRole("department", "admin"),
  getDepartmentComplaints
);

// Officer gets their assigned complaints
router.get(
  "/my-assigned",
  authMiddleware,
  requireRole("department"),
  getMyAssignedComplaints
);

// Update status
router.put(
  "/:id/status",
  authMiddleware,
  requireRole("department", "admin"),
  complaintUploadMiddleware,
  [
    param("id").isMongoId().withMessage("Invalid complaint id"),
    body("status").isIn(STATUS).withMessage("Invalid status"),
  ],
  updateComplaintStatus
);

// Assign to member
router.put(
  "/:id/assign",
  authMiddleware,
  requireRole("department", "admin"),
  [
    param("id").isMongoId().withMessage("Invalid complaint id"),
    body("memberId").isMongoId().withMessage("memberId is required"),
  ],
  assignComplaint
);

// Get complaint detail (citizen own / department owning / admin)
router.get(
  "/:id",
  authMiddleware,
  requireRole("citizen", "department", "admin"),
  [param("id").isMongoId().withMessage("Invalid complaint id")],
  getComplaintById
);

// Get complaint evidence (citizen owner / department owning / admin)
router.get(
  "/:id/evidence",
  authMiddleware,
  requireRole("citizen", "department", "admin"),
  [param("id").isMongoId().withMessage("Invalid complaint id")],
  getComplaintEvidence
);

// Get complaint resolution evidence (citizen owner / department owning / admin)
router.get(
  "/:id/resolution-evidence",
  authMiddleware,
  requireRole("citizen", "department", "admin"),
  [param("id").isMongoId().withMessage("Invalid complaint id")],
  getComplaintResolutionEvidence
);

// Retry AI analysis (department authority or admin)
router.post(
  "/:id/retry-ai",
  authMiddleware,
  requireRole("department", "admin"),
  [param("id").isMongoId().withMessage("Invalid complaint id")],
  retryComplaintAiAnalysis
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole("citizen", "admin"),
  [param("id").isMongoId().withMessage("Invalid complaint id")],
  deleteComplaint
);

export default router;
