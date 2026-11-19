import crypto from "crypto";
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { User, DEPARTMENTS } from "../models/User.js";
import { Member } from "../models/Member.js";
import { Complaint } from "../models/Complaint.js";
import { notifyUser } from "../services/complaintNotification.service.js";
import { parsePagination, formatPaginatedResponse } from "../utils/pagination.js";
import { sendPasswordResetEmail } from "../services/email.service.js";

export const getLoginValidationError = ({ user, requestedRole, department, departmentRole }) => {
  if (requestedRole && user.role !== requestedRole) {
    return { status: 403, message: `This account is registered as ${user.role}.` };
  }
  if (department && !DEPARTMENTS.includes(department)) {
    return { status: 400, message: "A valid department is required for department login." };
  }
  if (department && user.department !== department) {
    return { status: 403, message: "This account is registered for a different department." };
  }
  if (departmentRole && !["authority", "officer"].includes(departmentRole)) {
    return { status: 400, message: "Invalid department login type." };
  }
  if (departmentRole && user.departmentRole !== departmentRole) {
    return { status: 403, message: `This account is registered as a department ${user.departmentRole || "unassigned"}.` };
  }
  if (user.status !== "active") {
    return { status: 403, message: "This account is not active." };
  }
  return null;
};

const signToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const getOfficerContext = async (user) => {
  if (user?.role !== "department") {
    return {
      departmentRole: null,
      isOfficer: false,
      memberId: null,
    };
  }

  const departmentRole = user.departmentRole || null;
  const isOfficer = departmentRole === "officer";

  let memberId = null;
  let memberName = null;
  if (isOfficer) {
    const member = await Member.findOne({ userId: user._id, department: user.department }).select("_id name").lean();
    memberId = member?._id?.toString() || null;
    memberName = member?.name || null;
  }

  return {
    departmentRole,
    isOfficer,
    memberId,
    memberName,
  };
};

const serializeUser = (user, extra = {}) => {
  const departmentRole = user.role === "department"
    ? (extra.departmentRole || user.departmentRole || null)
    : null;
  const isOfficer = user.role === "department"
    ? (typeof extra.isOfficer === "boolean" ? extra.isOfficer : departmentRole === "officer")
    : false;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    department: user.department || null,
    departmentRole,
    status: user.status,
    isOfficer,
    memberId: extra.memberId || null,
    memberName: extra.memberName || null,
    createdAt: user.createdAt,
  };
};

const serializeDepartmentRequest = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  department: user.department || null,
  departmentRole: user.departmentRole || null,
  status: user.status,
  appliedAt: user.createdAt,
  reviewedAt: user.reviewedAt || null,
  reviewedBy: user.reviewedBy?.name || null,
});

export const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, role, department } = req.body;

  if (role === "admin" || !["citizen", "department"].includes(role)) {
    return res.status(400).json({ message: "Admin registration is not allowed through public registration." });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    if (role === "department" && !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ message: "Invalid department" });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      department,
      ...(role === "department" ? { departmentRole: "officer" } : {}),
    });

    if (user.role === "department" && user.status !== "active") {
      return res.status(202).json({
        message: "Authority registration submitted and pending admin approval",
        user: serializeUser(user),
      });
    }

    const token = signToken(user);
    const officerContext = await getOfficerContext(user);

    return res.status(201).json({
      token,
      user: serializeUser(user, officerContext),
    });
  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, role, department, departmentRole } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const requestedRole = (role === "authority" || role === "officer") ? "department" : role;
    const effectiveDepartmentRole = departmentRole || (role === "officer" ? "officer" : (role === "authority" ? "authority" : undefined));
    const loginError = getLoginValidationError({
      user,
      requestedRole,
      department,
      departmentRole: effectiveDepartmentRole,
    });
    if (loginError) return res.status(loginError.status).json({ message: loginError.message });

    const token = signToken(user);
    const officerContext = await getOfficerContext(user);

    return res.json({
      token,
      user: serializeUser(user, officerContext),
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const officerContext = await getOfficerContext(user);
    return res.json({
      user: serializeUser(user, officerContext),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};

export const listUsers = async (req, res) => {
  try {
    const { isPaginated, page, limit, skip } = parsePagination(req.query);
    const total = await User.countDocuments({});

    const queryChain = User.find({})
      .select("-password")
      .sort({ createdAt: -1, _id: -1 });

    if (isPaginated) {
      queryChain.skip(skip).limit(limit);
    }

    const users = await queryChain;
    const userIds = users.map((u) => u._id);

    const complaintCounts = await Complaint.aggregate([
      { $match: { createdBy: { $in: userIds } } },
      { $group: { _id: "$createdBy", complaintsCount: { $sum: 1 } } },
    ]);

    const complaintsByUserId = complaintCounts.reduce((acc, entry) => {
      acc[entry._id.toString()] = entry.complaintsCount;
      return acc;
    }, {});

    // Read-only Member lookup enriched strictly for the target user slice
    const members = await Member.find({ userId: { $in: userIds } })
      .select("_id name department userId")
      .lean();

    const membersByUserId = members.reduce((acc, m) => {
      if (m.userId) {
        acc[m.userId.toString()] = {
          memberId: m._id.toString(),
          memberName: m.name,
        };
      }
      return acc;
    }, {});

    const serializedUsers = users.map((user) => {
      const mapping = membersByUserId[user._id.toString()];
      const isOfficer = user.role === "department" && user.departmentRole === "officer";
      return {
        ...serializeUser(user, {
          memberId: mapping?.memberId || null,
          memberName: mapping?.memberName || null,
        }),
        memberLinked: isOfficer ? Boolean(mapping?.memberId) : false,
        complaintsCount: complaintsByUserId[user._id.toString()] || 0,
      };
    });

    if (isPaginated) {
      return res.json(formatPaginatedResponse(serializedUsers, total, page, limit));
    }

    res.set("X-Total-Count", String(total));
    return res.json(serializedUsers);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

export const listDepartmentRequests = async (req, res) => {
  try {
    const users = await User.find({ role: "department" })
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 });

    return res.json(users.map(serializeDepartmentRequest));
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch department requests", error: error.message });
  }
};

export const reviewDepartmentRequest = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { status, departmentRole } = req.body;

  try {
    const user = await User.findOne({ _id: id, role: "department" });

    if (!user) {
      return res.status(404).json({ message: "Department request not found" });
    }

    if (status) {
      user.status = status;
    }
    if (departmentRole && ["authority", "officer"].includes(departmentRole)) {
      user.departmentRole = departmentRole;
    }
    user.reviewedAt = new Date();
    user.reviewedBy = req.user._id;
    await user.save();

    if (status) {
      await notifyUser(user._id, {
        eventType: status === "active" ? "department_account_approved" : "department_account_rejected",
        title: status === "active" ? "Department account approved" : "Department account rejected",
        message: status === "active"
          ? "Your department account has been approved."
          : "Your department account has been rejected.",
        dedupeKey: `${user._id.toString()}:account-status:${status}:${user.reviewedAt.getTime()}`,
      });
    }

    await user.populate("reviewedBy", "name");

    return res.json(serializeDepartmentRequest(user));
  } catch (error) {
    return res.status(500).json({ message: "Failed to update department request", error: error.message });
  }
};

export const updateDepartmentRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { departmentRole } = req.body;

  try {
    const user = await User.findOne({ _id: id, role: "department" });
    if (!user) {
      return res.status(404).json({ message: "Department user not found" });
    }

    user.departmentRole = departmentRole;
    await user.save();

    const officerContext = await getOfficerContext(user);
    return res.json({
      message: `User department role updated to ${departmentRole}`,
      user: serializeUser(user, officerContext),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update department role", error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, phone } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name && typeof name === "string") {
      user.name = name.trim();
    }

    if (phone !== undefined) {
      if (typeof phone === "string") {
        const trimmedPhone = phone.trim();
        if (trimmedPhone && !/^\+?[0-9\s\-()]{7,20}$/.test(trimmedPhone)) {
          return res.status(400).json({ message: "Invalid phone number format." });
        }
        user.phone = trimmedPhone;
      }
    }

    await user.save();

    const officerContext = await getOfficerContext(user);
    return res.json({
      message: "Profile updated successfully",
      user: serializeUser(user, officerContext),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

export const changePassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update password", error: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    const user = await User.findOne({ email: normalizedEmail, status: "active" });

    // Generic response to prevent account enumeration
    const genericResponse = {
      message: "If an account with that email exists, password reset instructions have been sent.",
    };

    if (!user) {
      return res.json(genericResponse);
    }

    // Generate cryptographically secure random token (single-use, 15 min expiry)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    await sendPasswordResetEmail({
      to: user.email,
      token: resetToken,
    });

    return res.json(genericResponse);
  } catch (error) {
    console.error("[Auth] Forgot password error:", error.message);
    return res.status(500).json({ message: "Unable to process password reset request at this time." });
  }
};

export const resetPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token, password } = req.body;

  try {
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Password reset token is required." });
    }

    const hashedToken = crypto.createHash("sha256").update(token.trim()).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Password reset token is invalid or has expired." });
    }

    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    return res.json({ message: "Password has been reset successfully. You can now log in with your new password." });
  } catch (error) {
    console.error("[Auth] Reset password error:", error.message);
    return res.status(500).json({ message: "Unable to reset password at this time." });
  }
};

export const getOfficerOptions = async (req, res) => {
  try {
    const { department } = req.query;
    if (department && !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ message: "Invalid department" });
    }

    const memberFilter = {
      userId: { $type: "objectId" },
    };
    if (department) {
      memberFilter.department = department;
    }

    const members = await Member.find(memberFilter)
      .populate("userId", "name email status role departmentRole department")
      .sort({ name: 1 })
      .lean();

    const activeLinkedOfficers = members
      .filter((m) => {
        const u = m.userId;
        return (
          u &&
          typeof u === "object" &&
          u.status === "active" &&
          u.role === "department" &&
          u.departmentRole === "officer" &&
          u.department === m.department
        );
      })
      .map((m) => ({
        id: m._id.toString(),
        name: m.name || m.userId.name,
        email: m.userId.email,
        department: m.department,
        status: m.userId.status,
        isLinked: true,
        statusBadge: "Active • Linked",
      }));

    return res.json(activeLinkedOfficers);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch officer options", error: error.message });
  }
};
