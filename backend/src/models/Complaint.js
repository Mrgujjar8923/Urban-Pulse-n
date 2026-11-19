import mongoose from "mongoose";
import { DEPARTMENTS } from "./User.js";

const STATUS = ["Pending", "Assigned", "In Progress", "Resolved"];
const timelineEventSchema = new mongoose.Schema(
  {
    eventType: { type: String },
    label: { type: String },
    // Keep this separate from the complaint's current status. It may contain
    // legacy descriptive values that must remain writable.
    status: { type: String },
    timestamp: { type: Date },
    time: { type: Date },
    note: { type: String },
  },
  { _id: false, strict: false }
);

const slaSchema = new mongoose.Schema(
  {
    startedAt: { type: Date },
    durationMinutes: { type: Number, min: 1 },
    deadline: { type: Date },
    resolvedAt: { type: Date },
  },
  { _id: false }
);

const resolutionHistorySchema = new mongoose.Schema(
  {
    remarks: { type: String, required: true, trim: true, maxlength: 2000 },
    evidence: { type: String, default: "" },
    resolvedAt: { type: Date, default: Date.now },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: true }
);

const AI_ANALYSIS_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "manual_review_required",
];

const complaintSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, enum: DEPARTMENTS, required: true },
    status: { type: String, enum: STATUS, default: "Pending" },
    location: { type: String, trim: true, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    image: { type: String, default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    feedback: { type: mongoose.Schema.Types.ObjectId, ref: "Feedback", default: null },
    clientRequestId: {
      type: String,
      default: null,
      index: {
        unique: true,
        partialFilterExpression: { clientRequestId: { $type: "string" } },
      },
    },
    aiAnalysis: {
      status: {
        type: String,
        enum: AI_ANALYSIS_STATUSES,
        default: "pending",
      },
      errorCategory: { type: String, default: null },
      errorMessage: { type: String, default: null },
      retryCount: { type: Number, default: 0 },
      lastAttemptAt: { type: Date, default: null },
      model: { type: String, default: null },
      detectedLanguage: { type: String },
      englishTranslation: { type: String },
      category: { type: String },
      priority: { type: String, enum: ["Low", "Medium", "High", "Critical"] },
      urgencyScore: { type: Number, min: 1, max: 10 },
      confidence: { type: Number, min: 0, max: 1 },
      reasoning: { type: String },
      detectedIssue: { type: String },
      affectedArea: { type: String },
      recommendedDepartment: { type: String },
      recommendedAction: { type: String },
      analyzedAt: { type: Date },
    },
    sla: { type: slaSchema, default: undefined },
    resolutionHistory: {
      type: [resolutionHistorySchema],
      default: [],
    },
    timeline: {
      type: [timelineEventSchema],
      default: [],
    },
  },
  { timestamps: true, autoIndex: false }
);

complaintSchema.index(
  { createdBy: 1, createdAt: -1 },
  { name: "idx_complaints_creator_created" }
);

complaintSchema.index(
  { category: 1, createdAt: -1 },
  { name: "idx_complaints_category_created" }
);

complaintSchema.index(
  { category: 1, assignedTo: 1, createdAt: -1 },
  { name: "idx_complaints_dept_assigned_created" }
);

complaintSchema.index(
  { "sla.deadline": 1, status: 1 },
  { name: "idx_complaints_sla_deadline_status" }
);

export const Complaint = mongoose.model("Complaint", complaintSchema);
export { STATUS, AI_ANALYSIS_STATUSES };
