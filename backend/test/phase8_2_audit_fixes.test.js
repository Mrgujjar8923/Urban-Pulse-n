import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getAdminFeedback } from "../src/controllers/admin.controller.js";
import { deleteComplaint } from "../src/controllers/complaint.controller.js";
import { updateProfile, changePassword } from "../src/controllers/auth.controller.js";
import { User } from "../src/models/User.js";
import { Complaint } from "../src/models/Complaint.js";
import { Feedback } from "../src/models/Feedback.js";
import { Notification } from "../src/models/Notification.js";
import {
  getStorageDriver,
  setStorageDriver,
} from "../src/services/evidenceStorage.service.js";

const sampleObjectId = () => new mongoose.Types.ObjectId().toString();

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    set(header, value) {
      this.headers[header] = value;
      return this;
    },
    send() {
      return this;
    },
  };
  return res;
};

test("Phase 8.2: Fix 1 — Admin Feedback Rating Filter", async (t) => {
  await t.test("getAdminFeedback applies minRating query filter correctly", async () => {
    const originalFeedbackFind = Feedback.find;
    const originalComplaintCount = Complaint.countDocuments;
    const originalComplaintFind = Complaint.find;

    const dummyFeedbackIds = [sampleObjectId(), sampleObjectId()];
    let distinctFieldArg = null;
    let feedbackFilterArg = null;

    Feedback.find = (filter) => {
      if (filter && filter.rating) {
        feedbackFilterArg = filter;
        return {
          distinct: async (field) => {
            distinctFieldArg = field;
            return dummyFeedbackIds;
          },
        };
      }
      return Promise.resolve([
        { rating: 4, workCompleted: true },
        { rating: 5, workCompleted: true },
      ]);
    };

    let complaintFilterArg = null;
    Complaint.countDocuments = async (filter) => {
      complaintFilterArg = filter;
      return 2;
    };

    Complaint.find = () => {
      return {
        populate: () => ({
          populate: () => ({
            populate: () => ({
              sort: () => ({
                skip: () => ({
                  limit: async () => [
                    {
                      _id: sampleObjectId(),
                      title: "Water leak",
                      category: "Water Supply",
                      location: "Main St",
                      createdBy: { name: "Citizen", email: "citizen@test.gov" },
                      assignedTo: { name: "Officer", department: "Water Supply" },
                      feedback: { rating: 4, comment: "Good", workCompleted: true, percentDone: 100 },
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
      };
    };

    const req = {
      query: { minRating: "4", department: "Water Supply", page: "1", limit: "10" },
    };
    const res = createMockRes();

    try {
      await getAdminFeedback(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(distinctFieldArg, "_id");
      assert.deepStrictEqual(feedbackFilterArg, { rating: { $gte: 4 } });
      assert.strictEqual(complaintFilterArg.category, "Water Supply");
      assert.deepStrictEqual(complaintFilterArg.feedback, { $in: dummyFeedbackIds });
      assert.strictEqual(res.headers["X-Total-Count"], "2");
      assert.strictEqual(res.body.pagination.totalCount, 2);
    } finally {
      Feedback.find = originalFeedbackFind;
      Complaint.countDocuments = originalComplaintCount;
      Complaint.find = originalComplaintFind;
    }
  });

  await t.test("getAdminFeedback handles empty / no minRating without filtering ratings", async () => {
    const originalFeedbackFind = Feedback.find;
    const originalComplaintCount = Complaint.countDocuments;
    const originalComplaintFind = Complaint.find;

    let complaintFilterArg = null;
    Complaint.countDocuments = async (filter) => {
      complaintFilterArg = filter;
      return 5;
    };

    Complaint.find = () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            sort: () => ({
              skip: () => ({
                limit: async () => [],
              }),
            }),
          }),
        }),
      }),
    });

    Feedback.find = async () => [];

    const req = { query: {} };
    const res = createMockRes();

    try {
      await getAdminFeedback(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(complaintFilterArg.feedback, { $ne: null });
      assert.strictEqual(complaintFilterArg.category, undefined);
    } finally {
      Feedback.find = originalFeedbackFind;
      Complaint.countDocuments = originalComplaintCount;
      Complaint.find = originalComplaintFind;
    }
  });
});

test("Phase 8.2: Fix 2 — Complaint Evidence File Cleanup on Deletion", async (t) => {
  await t.test("deleteComplaint removes physical evidence images after database deletion", async () => {
    const citizenId = sampleObjectId();
    const complaintId = sampleObjectId();
    const intakeImage = "complaints/test-intake-photo.jpg";
    const resolutionEvidence1 = "complaints/test-res-photo-1.jpg";
    const resolutionEvidence2 = "complaints/test-res-photo-2.png";

    const deletedFiles = [];
    const originalDriver = getStorageDriver();
    setStorageDriver({
      ...originalDriver,
      deleteEvidenceFile: async (key) => {
        deletedFiles.push(key);
        return true;
      },
    });

    const originalFindById = Complaint.findById;
    const originalStartSession = mongoose.startSession;

    Complaint.findById = async () => ({
      _id: complaintId,
      createdBy: citizenId,
      image: intakeImage,
      resolutionHistory: [
        { evidence: resolutionEvidence1 },
        { evidence: "" }, // empty should be skipped
        { evidence: resolutionEvidence2 },
      ],
    });

    mongoose.startSession = async () => ({
      withTransaction: async (fn) => fn(),
      endSession: async () => {},
    });

    // Mock deleteComplaintRecords dependencies
    const originalFeedbackDelete = Feedback.deleteMany;
    const originalNotificationDelete = Notification.deleteMany;
    const originalFindOneAndDelete = Complaint.findOneAndDelete;

    Feedback.deleteMany = async () => ({ deletedCount: 1 });
    Notification.deleteMany = async () => ({ deletedCount: 0 });
    Complaint.findOneAndDelete = async () => ({ _id: complaintId });

    const req = {
      params: { id: complaintId },
      user: { _id: citizenId, role: "citizen" },
    };
    const res = createMockRes();

    try {
      await deleteComplaint(req, res);

      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(deletedFiles.length, 3);
      assert.ok(deletedFiles.includes(intakeImage));
      assert.ok(deletedFiles.includes(resolutionEvidence1));
      assert.ok(deletedFiles.includes(resolutionEvidence2));
    } finally {
      setStorageDriver(originalDriver);
      Complaint.findById = originalFindById;
      mongoose.startSession = originalStartSession;
      Feedback.deleteMany = originalFeedbackDelete;
      Notification.deleteMany = originalNotificationDelete;
      Complaint.findOneAndDelete = originalFindOneAndDelete;
    }
  });

  await t.test("deleteComplaint does not delete evidence files if database deletion fails", async () => {
    const citizenId = sampleObjectId();
    const complaintId = sampleObjectId();
    const intakeImage = "complaints/failed-del-intake.jpg";

    const deletedFiles = [];
    const originalDriver = getStorageDriver();
    setStorageDriver({
      ...originalDriver,
      deleteEvidenceFile: async (key) => {
        deletedFiles.push(key);
        return true;
      },
    });

    const originalFindById = Complaint.findById;
    const originalStartSession = mongoose.startSession;

    Complaint.findById = async () => ({
      _id: complaintId,
      createdBy: citizenId,
      image: intakeImage,
      resolutionHistory: [],
    });

    mongoose.startSession = async () => ({
      withTransaction: async () => {
        throw new Error("DB connection failure during transaction");
      },
      endSession: async () => {},
    });

    const req = {
      params: { id: complaintId },
      user: { _id: citizenId, role: "citizen" },
    };
    const res = createMockRes();

    try {
      await deleteComplaint(req, res);

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(deletedFiles.length, 0); // Files must NOT be deleted!
    } finally {
      setStorageDriver(originalDriver);
      Complaint.findById = originalFindById;
      mongoose.startSession = originalStartSession;
    }
  });
});

test("Phase 8.2: Fix 4 — Functional Profile Settings & Password Change Backend", async (t) => {
  await t.test("updateProfile updates user name and returns serialized user without password hash", async () => {
    const userId = sampleObjectId();
    let saved = false;

    const mockUser = {
      _id: userId,
      name: "Old Name",
      email: "citizen@govai.gov",
      role: "citizen",
      status: "active",
      createdAt: new Date(),
      save: async function () {
        saved = true;
      },
    };

    const originalFindById = User.findById;
    User.findById = async (id) => (id.toString() === userId.toString() ? mockUser : null);

    const req = {
      user: { _id: userId, role: "citizen" },
      body: { name: "Updated Citizen Name" },
    };
    const res = createMockRes();

    try {
      await updateProfile(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(saved, true);
      assert.strictEqual(mockUser.name, "Updated Citizen Name");
      assert.strictEqual(res.body.user.name, "Updated Citizen Name");
      assert.strictEqual(res.body.user.password, undefined);
    } finally {
      User.findById = originalFindById;
    }
  });

  await t.test("updateProfile ignores attempts to mutate role, email, status, or department", async () => {
    const userId = sampleObjectId();

    const mockUser = {
      _id: userId,
      name: "Original Name",
      email: "citizen@govai.gov",
      role: "citizen",
      status: "active",
      department: null,
      createdAt: new Date(),
      save: async function () {},
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const req = {
      user: { _id: userId, role: "citizen" },
      body: {
        name: "Legit Name",
        role: "admin", // Malicious privilege escalation attempt
        email: "hacked@govai.gov",
        status: "active",
        department: "Electricity",
      },
    };
    const res = createMockRes();

    try {
      await updateProfile(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(mockUser.name, "Legit Name");
      assert.strictEqual(mockUser.role, "citizen"); // role must NOT change!
      assert.strictEqual(mockUser.email, "citizen@govai.gov"); // email must NOT change!
      assert.strictEqual(mockUser.department, null);
    } finally {
      User.findById = originalFindById;
    }
  });

  await t.test("changePassword rejects incorrect current password with 400", async () => {
    const userId = sampleObjectId();
    const mockUser = {
      _id: userId,
      password: "hashed_current_password",
      comparePassword: async () => false, // Password mismatch
      save: async () => {},
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const req = {
      user: { _id: userId },
      body: {
        currentPassword: "WrongPassword123",
        newPassword: "NewSecurePassword456",
      },
    };
    const res = createMockRes();

    try {
      await changePassword(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, "Current password is incorrect");
    } finally {
      User.findById = originalFindById;
    }
  });

  await t.test("changePassword rejects identical new password with 400", async () => {
    const userId = sampleObjectId();
    const mockUser = {
      _id: userId,
      password: "hashed_current_password",
      comparePassword: async () => true, // Valid current password
      save: async () => {},
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const req = {
      user: { _id: userId },
      body: {
        currentPassword: "SamePassword123",
        newPassword: "SamePassword123",
      },
    };
    const res = createMockRes();

    try {
      await changePassword(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, "New password must be different from current password");
    } finally {
      User.findById = originalFindById;
    }
  });

  await t.test("changePassword updates password successfully when current password matches", async () => {
    const userId = sampleObjectId();
    let saved = false;

    const mockUser = {
      _id: userId,
      password: "old_hashed_password",
      comparePassword: async (candidate) => candidate === "ValidCurrent123",
      save: async function () {
        saved = true;
      },
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const req = {
      user: { _id: userId },
      body: {
        currentPassword: "ValidCurrent123",
        newPassword: "BrandNewSecurePassword456",
      },
    };
    const res = createMockRes();

    try {
      await changePassword(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(saved, true);
      assert.strictEqual(mockUser.password, "BrandNewSecurePassword456");
      assert.strictEqual(res.body.message, "Password updated successfully");
    } finally {
      User.findById = originalFindById;
    }
  });
});
