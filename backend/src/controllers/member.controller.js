import { validationResult } from "express-validator";
import mongoose from "mongoose";
import { Member } from "../models/Member.js";
import { User, DEPARTMENTS } from "../models/User.js";
import { Complaint } from "../models/Complaint.js";
import {
  validateMemberUserMapping,
  findEligibleDepartmentUsers,
  MemberMappingError,
} from "../services/memberMapping.service.js";

const userPopulateSelect = "name email role department status departmentRole";

const isAuthorityOrAdmin = (user) => (
  user?.role === "admin"
  || (user?.role === "department" && user.departmentRole === "authority")
);

const resolveTargetUserId = async (userId, email) => {
  if (userId) return userId;
  if (email && typeof email === "string" && email.trim()) {
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("_id").lean();
    if (!user) {
      throw new MemberMappingError("User with specified email not found", 404);
    }
    return user._id;
  }
  return null;
};

export const createMember = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, department: requestedDepartment, userId: rawUserId, email } = req.body;
    const department = req.user.role === "admin" ? requestedDepartment : req.user.department;

    if (!department) {
      return res.status(400).json({ message: "Department is required" });
    }

    if (!isAuthorityOrAdmin(req.user)) {
      return res.status(403).json({ message: "Only department authorities can manage department members" });
    }

    let linkedUserId = null;
    const candidateUserId = await resolveTargetUserId(rawUserId, email);

    if (candidateUserId) {
      const { user } = await validateMemberUserMapping({
        userId: candidateUserId,
        department,
      });
      linkedUserId = user._id;
    }

    const member = await Member.create({
      name,
      department,
      userId: linkedUserId,
      createdBy: req.user._id,
    });

    const populatedMember = await Member.findById(member._id).populate("userId", userPopulateSelect);
    return res.status(201).json(populatedMember);
  } catch (error) {
    if (error instanceof MemberMappingError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "This user is already linked to another officer." });
    }
    return res.status(500).json({ message: "Failed to create member", error: error.message });
  }
};

export const updateMember = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid member ID" });
  }

  try {
    const member = await Member.findById(id);
    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    if (!isAuthorityOrAdmin(req.user)) {
      return res.status(403).json({ message: "Only department authorities can manage department members" });
    }
    if (req.user.role === "department") {
      if (member.department !== req.user.department) {
        return res.status(403).json({ message: "Cannot modify members of another department" });
      }
    }

    const { name, userId: rawUserId, email, unlinkUser } = req.body;

    if (name && typeof name === "string" && name.trim()) {
      member.name = name.trim();
    }

    if (unlinkUser === true || rawUserId === null) {
      member.userId = null;
    } else if (rawUserId !== undefined || email !== undefined) {
      const candidateUserId = await resolveTargetUserId(rawUserId, email);
      if (candidateUserId) {
        const { user } = await validateMemberUserMapping({
          userId: candidateUserId,
          department: member.department,
          memberId: member._id,
        });
        member.userId = user._id;
      }
    }

    await member.save();
    const populated = await Member.findById(member._id).populate("userId", userPopulateSelect);
    return res.json(populated);
  } catch (error) {
    if (error instanceof MemberMappingError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "This user is already linked to another officer." });
    }
    return res.status(500).json({ message: "Failed to update member", error: error.message });
  }
};

export const listMembers = async (req, res) => {
  try {
    if (!isAuthorityOrAdmin(req.user)) {
      return res.status(403).json({ message: "Department member lists are restricted to authorities" });
    }
    if (req.user.role === "department" && !DEPARTMENTS.includes(req.user.department)) {
      return res.status(403).json({ message: "Department identity is missing or invalid" });
    }

    const department = req.user.role === "admin" ? req.query.department : req.user.department;
    const filter = department ? { department } : {};
    const members = await Member.find(filter)
      .populate("userId", userPopulateSelect)
      .sort({ createdAt: -1 });

    return res.json(members);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch members", error: error.message });
  }
};

export const listEligibleDepartmentUsers = async (req, res) => {
  try {
    if (!isAuthorityOrAdmin(req.user)) {
      return res.status(403).json({ message: "Eligible officer lists are restricted to authorities" });
    }
    const department = req.user.role === "admin" ? req.query.department : req.user.department;

    if (!department || !DEPARTMENTS.includes(department)) {
      return res.status(400).json({ message: "A valid department is required" });
    }

    const eligible = await findEligibleDepartmentUsers({ department });
    return res.json(eligible);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch eligible users", error: error.message });
  }
};

export const getOfficerPerformance = async (req, res) => {
  try {
    // 1. Strict Role Authorization: Department Authorities only. Reject Citizen, Officer, and Admin.
    if (req.user?.role !== "department" || req.user?.departmentRole !== "authority") {
      return res.status(403).json({
        message: "Forbidden: Officer performance is restricted to department authorities",
      });
    }

    // 2. Strict Department Isolation: Always derive department from authenticated user
    const department = req.user.department;
    if (!department || !DEPARTMENTS.includes(department)) {
      return res.status(400).json({
        message: "Invalid or missing department on authenticated authority account",
      });
    }

    // 3. Fetch all Members in this Authority's department
    const members = await Member.find({ department })
      .populate("userId", userPopulateSelect)
      .sort({ createdAt: 1 })
      .lean();

    // 4. Fetch all Complaints in this department with feedback populated
    const complaints = await Complaint.find({ category: department })
      .populate("feedback", "rating comment workCompleted percentDone createdAt")
      .lean();

    // 5. Track department summary metrics
    let totalAssignedComplaints = 0;
    let resolvedComplaints = 0;
    let pendingComplaints = 0;
    let authorityResolvedCount = 0;

    const deptFeedbackRatings = [];
    let deptFeedbackWorkCompletedCount = 0;

    complaints.forEach((c) => {
      if (c.assignedTo) {
        totalAssignedComplaints += 1;
      }
      if (c.status === "Resolved") {
        resolvedComplaints += 1;
      } else {
        pendingComplaints += 1;
      }

      if (c.feedback && typeof c.feedback.rating === "number") {
        deptFeedbackRatings.push(c.feedback.rating);
        if (c.feedback.workCompleted) {
          deptFeedbackWorkCompletedCount += 1;
        }
      }

      // Check if resolved by an Authority
      const latestResolution = c.resolutionHistory?.length > 0
        ? c.resolutionHistory[c.resolutionHistory.length - 1]
        : null;
      if (c.status === "Resolved" && latestResolution?.resolvedBy) {
        const resolvedByStr = (latestResolution.resolvedBy._id || latestResolution.resolvedBy).toString();
        if (resolvedByStr === req.user._id.toString()) {
          authorityResolvedCount += 1;
        }
      }
    });

    // 6. Aggregate per-officer stats
    const officerStats = members.map((member) => {
      const memberIdStr = (member._id || member.id).toString();
      const linkedUserObj = member.userId && typeof member.userId === "object" ? member.userId : null;
      const linkedUserIdStr = linkedUserObj?._id ? (linkedUserObj._id).toString() : null;
      const isLinked = Boolean(linkedUserIdStr);
      const isActive = Boolean(linkedUserObj && linkedUserObj.status === "active");

      // Filter complaints assigned to this officer
      const assignedToMember = complaints.filter(
        (c) => c.assignedTo && (c.assignedTo._id || c.assignedTo).toString() === memberIdStr
      );

      const assignedCount = assignedToMember.length;
      const pendingCount = assignedToMember.filter((c) => c.status !== "Resolved").length;

      // Resolved complaints attributed to this officer:
      // Must be Resolved, and if resolutionHistory is present, resolvedBy must match officer's linked user.
      // If resolutionHistory has an authority as resolvedBy, do NOT credit the officer.
      const resolvedList = assignedToMember.filter((c) => {
        if (c.status !== "Resolved") return false;
        const latestResolution = c.resolutionHistory?.length > 0
          ? c.resolutionHistory[c.resolutionHistory.length - 1]
          : null;
        if (latestResolution?.resolvedBy) {
          const resolvedByStr = (latestResolution.resolvedBy._id || latestResolution.resolvedBy).toString();
          // If resolvedBy is recorded, it must match this officer's linked user
          return Boolean(linkedUserIdStr && resolvedByStr === linkedUserIdStr);
        }
        // Fallback for legacy records without resolutionHistory if linked
        return isLinked;
      });

      const resolvedCount = resolvedList.length;
      const resolutionRate = assignedCount > 0
        ? Math.round((resolvedCount / assignedCount) * 100)
        : 0;

      // Feedback attributed to this officer (feedbacks on complaints assigned/resolved by this officer)
      const officerFeedbacks = assignedToMember
        .filter((c) => c.feedback && typeof c.feedback.rating === "number")
        .map((c) => c.feedback);

      const feedbackCount = officerFeedbacks.length;
      const avgRating = feedbackCount > 0
        ? Number((officerFeedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbackCount).toFixed(1))
        : null; // "Not Rated" when feedback is missing

      return {
        id: memberIdStr,
        _id: memberIdStr,
        name: member.name,
        department: member.department,
        status: isActive ? "active" : "inactive",
        isLinked,
        linkedUser: linkedUserObj
          ? {
              id: linkedUserIdStr,
              name: linkedUserObj.name,
              email: linkedUserObj.email,
              status: linkedUserObj.status,
            }
          : null,
        assignedComplaints: assignedCount,
        resolvedComplaints: resolvedCount,
        pendingComplaints: pendingCount,
        resolutionRate,
        avgRating, // null if feedbackCount === 0
        feedbackCount,
      };
    });

    const activeOfficersCount = members.filter(
      (m) => m.userId && typeof m.userId === "object" && m.userId.status === "active"
    ).length;

    const avgDeptRating = deptFeedbackRatings.length > 0
      ? Number((deptFeedbackRatings.reduce((sum, r) => sum + r, 0) / deptFeedbackRatings.length).toFixed(1))
      : null;

    const percentSatisfied = deptFeedbackRatings.length > 0
      ? Math.round((deptFeedbackWorkCompletedCount / deptFeedbackRatings.length) * 100)
      : null;

    return res.status(200).json({
      department,
      summary: {
        totalOfficers: members.length,
        activeOfficers: activeOfficersCount,
        totalAssignedComplaints,
        resolvedComplaints,
        pendingComplaints,
        authorityResolvedComplaints: authorityResolvedCount,
        feedbackSummary: {
          totalFeedbacks: deptFeedbackRatings.length,
          avgRating: avgDeptRating,
          percentSatisfied,
        },
      },
      officers: officerStats,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch officer performance",
      error: error.message,
    });
  }
};
