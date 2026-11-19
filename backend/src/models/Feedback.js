import mongoose from "mongoose";

const feedbackHistoryEntrySchema = new mongoose.Schema(
  {
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, default: "" },
    image: { type: String, default: "" },
    workCompleted: { type: Boolean },
    percentDone: { type: Number, min: 0, max: 100 },
    resolutionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const feedbackSchema = new mongoose.Schema(
  {
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
    image: { type: String, default: "" },
    workCompleted: { type: Boolean, required: true },
    percentDone: { type: Number, min: 0, max: 100, default: 0 },
    resolutionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    history: { type: [feedbackHistoryEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const Feedback = mongoose.model("Feedback", feedbackSchema);
