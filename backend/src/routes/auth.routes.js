import { Router } from "express";
import { body, param } from "express-validator";
import {
  listDepartmentRequests,
  listUsers,
  login,
  register,
  reviewDepartmentRequest,
  updateDepartmentRole,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getOfficerOptions,
} from "../controllers/auth.controller.js";
import { DEPARTMENTS } from "../models/User.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { authLimiter, passwordResetLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get("/me", authMiddleware, getMe);

router.put(
  "/profile",
  authMiddleware,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("phone").optional().isString().trim(),
  ],
  updateProfile
);

router.put(
  "/change-password",
  authMiddleware,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  ],
  changePassword
);

router.post(
  "/forgot-password",
  passwordResetLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
  ],
  forgotPassword
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  resetPassword
);

router.post(
  "/register",
  authLimiter,
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role").isIn(["citizen", "department"]).withMessage("Invalid role"),
    body("department").custom((value, { req }) => {
      if (req.body.role === "department") {
        if (!value) throw new Error("Department is required for department users");
        if (!DEPARTMENTS.includes(value)) throw new Error("Invalid department");
      }
      return true;
    }),
  ],
  register
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
    body("departmentRole").optional().isIn(["authority", "officer"]).withMessage("Invalid department login type."),
  ],
  login
);

router.get("/officer-options", getOfficerOptions);

router.get("/users", authMiddleware, requireRole("admin"), listUsers);

router.get("/department-requests", authMiddleware, requireRole("admin"), listDepartmentRequests);

router.put(
  "/department-requests/:id",
  authMiddleware,
  requireRole("admin"),
  [
    param("id").isMongoId().withMessage("Invalid ID"),
    body("status")
      .optional()
      .isIn(["active", "rejected"])
      .withMessage("Status must be active or rejected"),
    body("departmentRole")
      .optional()
      .isIn(["authority", "officer"])
      .withMessage("departmentRole must be authority or officer"),
  ],
  reviewDepartmentRequest
);

router.put(
  "/users/:id/department-role",
  authMiddleware,
  requireRole("admin"),
  [
    param("id").isMongoId().withMessage("Invalid ID"),
    body("departmentRole")
      .isIn(["authority", "officer"])
      .withMessage("departmentRole must be authority or officer"),
  ],
  updateDepartmentRole
);

export default router;
