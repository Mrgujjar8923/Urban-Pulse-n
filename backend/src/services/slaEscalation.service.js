import mongoose from "mongoose";
import { Complaint } from "../models/Complaint.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { calculateSlaState } from "./sla.service.js";
import { emitNotificationToUser } from "./notificationSocket.service.js";

const ESCALATION_EVENT_TYPE = "sla_overdue_escalated";

const isDuplicateKeyError = (error) => error?.code === 11000;

const findRecipients = async (department) => User.find({
  status: "active",
  $or: [
    { role: "admin" },
    { role: "department", department },
  ],
}).select("_id").lean();

const createEscalationNotification = async (complaint, recipient) => {
  const dedupeKey = `${complaint._id.toString()}:sla-overdue:${recipient._id.toString()}`;
  try {
    const notification = await Notification.create({
      userId: recipient._id,
      message: `Complaint ${complaint._id.toString()} has exceeded its SLA deadline.`,
      dedupeKey,
      meta: {
        complaintId: complaint._id.toString(),
        type: "sla_overdue",
        department: complaint.category,
      },
    });
    await emitNotificationToUser(notification);
    return notification;
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
};

const recordEscalationEvent = async (complaintId, timestamp) => {
  const result = await Complaint.updateOne(
    {
      _id: complaintId,
      status: { $ne: "Resolved" },
      "sla.deadline": { $lte: timestamp },
      timeline: { $not: { $elemMatch: { eventType: ESCALATION_EVENT_TYPE } } },
    },
    {
      $push: {
        timeline: {
          eventType: ESCALATION_EVENT_TYPE,
          label: "SLA Overdue Escalated",
          timestamp,
          note: "Complaint exceeded its persisted SLA deadline.",
        },
      },
    }
  );
  return result.modifiedCount === 1;
};

export const runOverdueSlaJob = async (now = new Date()) => {
  const overdueComplaints = await Complaint.find({
    status: { $ne: "Resolved" },
    "sla.deadline": { $exists: true, $lte: now },
    "sla.durationMinutes": { $gt: 0 },
  }).select("_id status category sla timeline").lean();

  let escalatedCount = 0;
  for (const complaint of overdueComplaints) {
    if (calculateSlaState(complaint, now).slaStatus !== "Overdue") continue;

    const recipients = await findRecipients(complaint.category);
    if (recipients.length === 0) {
      console.warn("[SLA escalation] No active recipients for overdue complaint", {
        complaintId: complaint._id.toString(),
        department: complaint.category,
      });
      continue;
    }

    for (const recipient of recipients) {
      await createEscalationNotification(complaint, recipient);
    }

    if (await recordEscalationEvent(complaint._id, now)) {
      escalatedCount += 1;
    }
  }

  return {
    examined: overdueComplaints.length,
    escalated: escalatedCount,
  };
};

let activeSlaTimer = null;

export const startOverdueSlaJob = ({
  intervalMs = Number(process.env.SLA_ESCALATION_INTERVAL_MS) || 60 * 1000,
} = {}) => {
  if (activeSlaTimer) {
    clearInterval(activeSlaTimer);
    activeSlaTimer = null;
  }

  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs >= 1000
    ? intervalMs
    : 60 * 1000;

  const execute = () => {
    if (mongoose.connection && mongoose.connection.readyState !== 1) {
      return;
    }
    runOverdueSlaJob().catch((error) => {
      console.error("[SLA escalation] Job failed", {
        code: error.code || "SLA_ESCALATION_FAILED",
        message: error.message,
      });
    });
  };

  execute();
  activeSlaTimer = setInterval(execute, safeIntervalMs);
  return activeSlaTimer;
};

export const stopOverdueSlaJob = () => {
  if (activeSlaTimer) {
    clearInterval(activeSlaTimer);
    activeSlaTimer = null;
  }
};

export { ESCALATION_EVENT_TYPE };
