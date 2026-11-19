import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const DEPARTMENTS = [
  "Road & Infrastructure",
  "Water Supply",
  "Electricity",
  "Environment",
];

const USER_STATUS = ["active", "pending", "rejected"];
const DEPARTMENT_ROLES = ["authority", "officer"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ["citizen", "department", "admin"], required: true },
    departmentRole: {
      type: String,
      enum: DEPARTMENT_ROLES,
      default: function () {
        return this.role === "department" ? "officer" : undefined;
      },
    },
    status: {
      type: String,
      enum: USER_STATUS,
      default: function () {
        return this.role === "department" ? "pending" : "active";
      },
    },
    department: {
      type: String,
      enum: DEPARTMENTS,
      required: function () {
        return this.role === "department";
      },
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    phone: { type: String, trim: true, default: "" },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model("User", userSchema);
export { DEPARTMENTS, USER_STATUS, DEPARTMENT_ROLES };
