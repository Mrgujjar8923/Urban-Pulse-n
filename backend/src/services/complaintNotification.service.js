import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { emitNotificationToUser } from "./notificationSocket.service.js";
import { resolveOfficerUser } from "./memberMapping.service.js";

const getComplaintId = (complaint) => complaint?._id?.toString();

const getUserId = (user) => user?._id || user?.id || user;

const logFailure = (logger, stage, error, complaintId, userId) => {
  logger.error(`[Complaint notification] ${stage} failed`, {
    code: error?.code || "COMPLAINT_NOTIFICATION_FAILED",
    message: error?.message,
    complaintId,
    ...(userId ? { userId: userId.toString() } : {}),
  });
};

const createAndEmit = async (
  {
    userId,
    complaint,
    eventType,
    message,
    dedupeKey,
    title,
    department = complaint?.category,
  },
  {
    notificationModel = Notification,
    emit = emitNotificationToUser,
    logger = console,
  } = {}
) => {
  const complaintId = getComplaintId(complaint);
  let notification;

  try {
    notification = await notificationModel.create({
      userId,
      message,
      dedupeKey: typeof dedupeKey === "function" ? dedupeKey({ _id: userId }) : dedupeKey,
      meta: {
        ...(complaintId ? { complaintId } : {}),
        type: eventType,
        title,
        ...(department ? { department } : {}),
      },
    });
  } catch (error) {
    if (error?.code === 11000) return { created: 0, emitted: 0 };
    logFailure(logger, "Persistence", error, complaintId, userId);
    return { created: 0, emitted: 0 };
  }

  try {
    return {
      created: 1,
      emitted: (await emit(notification)) ? 1 : 0,
    };
  } catch (error) {
    logFailure(logger, "Socket emission", error, complaintId, userId);
    return { created: 1, emitted: 0 };
  }
};

const findDepartmentRecipients = async (userModel, department) => (
  userModel.find({
    status: "active",
    role: "department",
    department,
  }).select("_id").lean()
);

const findDepartmentAuthorityRecipients = async (userModel, department) => (
  userModel.find({
    status: "active",
    role: "department",
    departmentRole: "authority",
    department,
  }).select("_id").lean()
);

const notifyRecipients = async (recipients, notification, options) => {
  let created = 0;
  let emitted = 0;

  for (const recipient of recipients) {
    const result = await createAndEmit({
      ...notification,
      userId: getUserId(recipient),
    }, options);
    created += result.created;
    emitted += result.emitted;
  }

  return { created, emitted };
};

export const notifyDepartmentUsers = async (
  complaint,
  {
    userModel = User,
    ...options
  } = {}
) => {
  const complaintId = getComplaintId(complaint);
  let recipients;

  try {
    recipients = await findDepartmentAuthorityRecipients(userModel, complaint.category);
  } catch (error) {
    logFailure(options.logger || console, "Recipient lookup", error, complaintId);
    return { created: 0, emitted: 0 };
  }

  return notifyRecipients(recipients, {
    complaint,
    eventType: "complaint_submitted",
    title: "New complaint submitted",
    message: "A new complaint has been submitted to your department.",
    dedupeKey: (recipient) => `${complaintId}:complaint-submitted:${getUserId(recipient).toString()}`,
  }, options);
};

export const notifyComplaintOwner = async (
  complaint,
  notification,
  {
    userModel = User,
    ...options
  } = {}
) => {
  const ownerId = getUserId(complaint.createdBy);
  if (!ownerId) return { created: 0, emitted: 0 };

  let owner;
  try {
    owner = await userModel.findOne({ _id: ownerId, status: "active", role: "citizen" }).select("_id").lean();
  } catch (error) {
    logFailure(options.logger || console, "Owner lookup", error, getComplaintId(complaint), ownerId);
    return { created: 0, emitted: 0 };
  }
  if (!owner) return { created: 0, emitted: 0 };

  return createAndEmit({
    ...notification,
    userId: owner._id,
  }, options);
};

export const notifyComplaintStatusChanged = async (
  complaint,
  previousStatus,
  options = {}
) => {
  if (previousStatus === complaint.status) return { created: 0, emitted: 0 };

  const eventType = complaint.status === "Resolved"
    ? "complaint_resolved"
    : previousStatus === "Resolved"
      ? "complaint_reopened"
      : "complaint_status_updated";

  const complaintId = getComplaintId(complaint);
  const operationTime = complaint.updatedAt?.getTime?.() || options.operationTime || Date.now();
  let created = 0;
  let emitted = 0;

  // 1. Notify the citizen owner
  const ownerResult = await notifyComplaintOwner(complaint, {
    complaint,
    eventType,
    title: `Complaint ${complaint.status}`,
    message: `Your complaint status is now ${complaint.status}.`,
    dedupeKey: `${complaintId}:owner-status:${complaint.status}:${operationTime}`,
  }, options);
  created += ownerResult.created;
  emitted += ownerResult.emitted;

  // 2. Notify assigned officer if linked user exists
  if (complaint.assignedTo) {
    try {
      const officerUser = await resolveOfficerUser(complaint.assignedTo, complaint.category, options);
      if (officerUser) {
        const officerResult = await createAndEmit({
          userId: officerUser._id,
          complaint,
          eventType,
          title: `Complaint ${complaint.status}`,
          message: previousStatus === "Resolved"
            ? "Assigned complaint has been reopened."
            : `Assigned complaint status is now ${complaint.status}.`,
          dedupeKey: `${complaintId}:officer-status:${officerUser._id.toString()}:${complaint.status}:${operationTime}`,
          department: complaint.category,
        }, options);
        created += officerResult.created;
        emitted += officerResult.emitted;
      }
    } catch (err) {
      logFailure(options.logger || console, "Officer status notification", err, complaintId, complaint.assignedTo);
    }
  }

  return { created, emitted };
};

export const notifyComplaintAssignment = async (
  complaint,
  previousAssignee,
  options = {}
) => {
  const currentAssignee = getUserId(complaint.assignedTo);
  const previousAssigneeId = getUserId(previousAssignee);
  if (currentAssignee && currentAssignee.toString() === previousAssigneeId?.toString()) {
    return { created: 0, emitted: 0 };
  }

  let created = 0;
  let emitted = 0;

  const complaintId = getComplaintId(complaint);
  const complaintTitle = complaint.title ? `"${complaint.title}"` : `Complaint ${complaintId}`;
  const operationTime = complaint.updatedAt?.getTime?.() || options.operationTime;
  const dedupeSuffix = operationTime ? `:${operationTime}` : "";

  // 1. Notify the citizen owner
  const ownerResult = await notifyComplaintOwner(complaint, {
    complaint,
    eventType: previousAssignee ? "complaint_reassigned" : "complaint_assigned",
    title: previousAssignee ? "Complaint reassigned" : "Complaint assigned",
    message: previousAssignee
      ? "Your complaint has been reassigned to a new officer."
      : "Your complaint has been assigned to an officer.",
    dedupeKey: `${complaintId}:${previousAssignee ? "reassigned" : "assigned"}:${complaint.assignedTo ? complaint.assignedTo.toString() : "unassigned"}${dedupeSuffix}`,
  }, options);
  created += ownerResult.created;
  emitted += ownerResult.emitted;

  // 2. Notify newly assigned officer if linked user exists
  if (currentAssignee) {
    try {
      const officerUser = await resolveOfficerUser(
        complaint.assignedTo || currentAssignee,
        complaint.category,
        options
      );
      if (officerUser) {
        const officerResult = await createAndEmit({
          userId: officerUser._id,
          complaint,
          eventType: previousAssignee ? "complaint_reassigned" : "complaint_assigned",
          title: previousAssignee ? "Complaint reassigned to you" : "New complaint assigned",
          message: previousAssignee
            ? `You have been reassigned ${complaintTitle}.`
            : `You have been assigned ${complaintTitle}.`,
          dedupeKey: `${complaintId}:officer-assigned:${officerUser._id.toString()}:${currentAssignee.toString()}${dedupeSuffix}`,
          department: complaint.category,
        }, options);
        created += officerResult.created;
        emitted += officerResult.emitted;
      }
    } catch (err) {
      logFailure(options.logger || console, "Officer assignment notification", err, complaintId, currentAssignee);
    }
  }

  // 3. Notify previous officer if reassigned and linked user exists
  if (previousAssigneeId && previousAssigneeId.toString() !== currentAssignee?.toString()) {
    try {
      const prevOfficerUser = await resolveOfficerUser(previousAssignee, complaint.category, options);
      if (prevOfficerUser) {
        const currentOfficerUser = currentAssignee
          ? await resolveOfficerUser(complaint.assignedTo || currentAssignee, complaint.category, options)
          : null;

        if (!currentOfficerUser || currentOfficerUser._id.toString() !== prevOfficerUser._id.toString()) {
          const prevOfficerResult = await createAndEmit({
            userId: prevOfficerUser._id,
            complaint,
            eventType: "complaint_unassigned",
            title: "Complaint assignment updated",
            message: currentAssignee
              ? `${complaintTitle} has been reassigned to another officer.`
              : `You have been unassigned from ${complaintTitle}.`,
            dedupeKey: `${complaintId}:officer-unassigned:${prevOfficerUser._id.toString()}:${previousAssigneeId.toString()}${dedupeSuffix}`,
            department: complaint.category,
          }, options);
          created += prevOfficerResult.created;
          emitted += prevOfficerResult.emitted;
        }
      }
    } catch (err) {
      logFailure(options.logger || console, "Previous officer notification", err, complaintId, previousAssigneeId);
    }
  }

  return { created, emitted };
};

export const notifyFeedbackReceived = async (
  complaint,
  feedback,
  {
    userModel = User,
    ...options
  } = {}
) => {
  let recipients;
  try {
    recipients = await findDepartmentRecipients(userModel, complaint.category);
  } catch (error) {
    logFailure(options.logger || console, "Recipient lookup", error, getComplaintId(complaint));
    return { created: 0, emitted: 0 };
  }

  return notifyRecipients(recipients, {
    complaint,
    eventType: "complaint_feedback_received",
    title: "Complaint feedback received",
    message: "A citizen has submitted feedback for a resolved complaint.",
    dedupeKey: (recipient) => `${getComplaintId(complaint)}:feedback:${feedback._id}:${getUserId(recipient).toString()}`,
  }, options);
};

export const notifyUser = async (
  userId,
  {
    eventType,
    title,
    message,
    dedupeKey,
  },
  options = {}
) => createAndEmit({
  userId,
  eventType,
  title,
  message,
  dedupeKey,
  complaint: null,
}, options);
