import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Member } from "../models/Member.js";

const getEntityId = (entity) => {
  if (!entity) return null;
  if (typeof entity === "string") return entity;
  if (entity._id) return entity._id.toString();
  if (entity.id) return entity.id.toString();
  return null;
};

export class MemberMappingError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "MemberMappingError";
    this.statusCode = statusCode;
  }
}

/**
 * Validates whether a User account is authorized and eligible to be linked to a Member in a given department.
 */
export const validateMemberUserMapping = async ({
  userId,
  department,
  memberId = null,
  userModel = User,
  memberModel = Member,
}) => {
  if (!userId) {
    return { valid: true, user: null };
  }

  const normalizedUserId = getEntityId(userId);
  if (!normalizedUserId || !mongoose.isValidObjectId(normalizedUserId)) {
    throw new MemberMappingError("Invalid user ID format for officer mapping", 400);
  }

  const user = await userModel.findById(normalizedUserId).select("name email role department status departmentRole").lean();
  if (!user) {
    throw new MemberMappingError("Linked user account not found", 404);
  }

  if (user.status !== "active") {
    throw new MemberMappingError("Linked user account must be active", 400);
  }

  if (user.role !== "department") {
    throw new MemberMappingError("Linked user account must have department role", 400);
  }

  if (user.department !== department) {
    throw new MemberMappingError(
      `Department mismatch: User belongs to ${user.department}, but member is in ${department}`,
      400
    );
  }

  if (user.departmentRole === "authority") {
    throw new MemberMappingError("Department authority accounts cannot be linked as field officers", 400);
  }

  const normalizedMemberId = getEntityId(memberId);
  const conflictFilter = {
    userId: user._id,
    ...(normalizedMemberId ? { _id: { $ne: normalizedMemberId } } : {}),
  };

  const existingMapping = await memberModel.findOne(conflictFilter).select("_id name").lean();
  if (existingMapping) {
    throw new MemberMappingError(
      `User is already linked to another officer (${existingMapping.name || existingMapping._id})`,
      409
    );
  }

  return { valid: true, user };
};

/**
 * Resolves the active User document linked to a Member.
 */
export const resolveOfficerUser = async (
  memberIdOrDoc,
  department,
  {
    memberModel = Member,
    userModel = User,
    logger = console,
  } = {}
) => {
  if (!memberIdOrDoc) return null;

  let member = memberIdOrDoc;

  // If member is an ID or not fully loaded
  const rawId = getEntityId(memberIdOrDoc);
  if (typeof memberIdOrDoc === "string" || mongoose.isValidObjectId(memberIdOrDoc) || (!member?.userId && !member?.department)) {
    try {
      member = await memberModel.findById(rawId).select("name department userId").lean();
    } catch (error) {
      logger.error?.("[Member mapping] Member resolution failed", {
        code: error?.code || "MEMBER_LOOKUP_FAILED",
        message: error?.message,
        memberId: rawId,
      });
      return null;
    }
  }

  if (!member || !member.userId) {
    return null;
  }

  const userId = getEntityId(member.userId);
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return null;
  }

  try {
    const user = await userModel.findOne({
      _id: userId,
      status: "active",
      role: "department",
      ...(department ? { department } : {}),
    }).select("_id name email department status").lean();

    return user;
  } catch (error) {
    logger.error?.("[Member mapping] Officer user lookup failed", {
      code: error?.code || "USER_LOOKUP_FAILED",
      message: error?.message,
      userId,
    });
    return null;
  }
};

/**
 * Returns active department users eligible for linking to a Member.
 */
export const findEligibleDepartmentUsers = async ({
  department,
  userModel = User,
  memberModel = Member,
} = {}) => {
  if (!department) return [];

  const users = await userModel.find({
    role: "department",
    department,
    status: "active",
    departmentRole: { $ne: "authority" },
  }).select("name email department departmentRole status createdAt").lean();

  const members = await memberModel.find({
    department,
    userId: { $ne: null },
  }).select("name userId").lean();

  const linkedUserMap = new Map();
  members.forEach((m) => {
    if (m.userId) {
      linkedUserMap.set(m.userId.toString(), {
        memberId: m._id.toString(),
        memberName: m.name,
      });
    }
  });

  return users.map((u) => {
    const linkedInfo = linkedUserMap.get(u._id.toString());
    return {
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      department: u.department,
      status: u.status,
      isLinked: Boolean(linkedInfo),
      linkedMember: linkedInfo || null,
    };
  });
};

