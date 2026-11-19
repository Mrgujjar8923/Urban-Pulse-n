import { Router } from "express";
import { body, param } from "express-validator";
import {
  createMember,
  updateMember,
  listMembers,
  listEligibleDepartmentUsers,
  getOfficerPerformance,
} from "../controllers/member.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRole("department", "admin"));

router.get("/eligible-users", listEligibleDepartmentUsers);
router.get("/performance", getOfficerPerformance);

router.post(
  "/",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("department").optional().isString(),
    body("userId").optional({ nullable: true }).isString(),
    body("email").optional().isEmail(),
  ],
  createMember
);

router.put(
  "/:id",
  [
    param("id").isMongoId().withMessage("Invalid member ID"),
    body("name").optional().isString(),
    body("userId").optional({ nullable: true }).isString(),
    body("email").optional().isEmail(),
    body("unlinkUser").optional().isBoolean(),
  ],
  updateMember
);

router.get("/", listMembers);

export default router;
