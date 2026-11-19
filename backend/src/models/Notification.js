import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    meta: { type: Object, default: {} },
    dedupeKey: { type: String, unique: true, sparse: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true, autoIndex: false }
);

notificationSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "idx_notifications_user_created" }
);

export const Notification = mongoose.model("Notification", notificationSchema);
