import mongoose from "mongoose";
import { DEPARTMENTS } from "./User.js";

const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    department: { type: String, enum: DEPARTMENTS, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

memberSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
);

export const Member = mongoose.model("Member", memberSchema);
