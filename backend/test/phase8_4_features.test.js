import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import mongoose from "mongoose";
import { forgotPassword, resetPassword, updateProfile } from "../src/controllers/auth.controller.js";
import {
  listNotifications,
  updateNotificationReadState,
  markAllNotificationsRead,
  clearNotifications,
} from "../src/controllers/notification.controller.js";
import { User } from "../src/models/User.js";
import { Notification } from "../src/models/Notification.js";
import { getSentEmails, clearSentEmails } from "../src/services/email.service.js";
import * as socketService from "../src/services/notificationSocket.service.js";

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

test("Phase 8.4: 1. Forgot Password & Reset Password", async (t) => {
  await t.test("forgotPassword returns generic message and does not leak when email is unknown", async () => {
    clearSentEmails();
    const originalFindOne = User.findOne;
    User.findOne = async () => null; // Unknown user

    const req = { body: { email: "nonexistent@govai.gov" } };
    const res = createMockRes();

    try {
      await forgotPassword(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(
        res.body.message,
        "If an account with that email exists, password reset instructions have been sent."
      );
      assert.strictEqual(getSentEmails().length, 0); // No email sent
    } finally {
      User.findOne = originalFindOne;
    }
  });

  await t.test("forgotPassword generates cryptographically hashed token and sends reset email", async () => {
    clearSentEmails();
    const userId = sampleObjectId();
    let saved = false;

    const mockUser = {
      _id: userId,
      email: "citizen@govai.gov",
      status: "active",
      passwordResetToken: null,
      passwordResetExpires: null,
      save: async function () {
        saved = true;
      },
    };

    const originalFindOne = User.findOne;
    User.findOne = async () => mockUser;

    const req = { body: { email: "citizen@govai.gov" } };
    const res = createMockRes();

    try {
      await forgotPassword(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(saved, true);
      assert.ok(mockUser.passwordResetToken);
      assert.ok(mockUser.passwordResetExpires > new Date());

      // Ensure the token stored in DB is a 64-char SHA-256 hash
      assert.strictEqual(mockUser.passwordResetToken.length, 64);

      const emails = getSentEmails();
      assert.strictEqual(emails.length, 1);
      assert.strictEqual(emails[0].to, "citizen@govai.gov");

      // Verify token in email hashes to the token in DB
      const rawToken = emails[0].token;
      const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      assert.strictEqual(mockUser.passwordResetToken, expectedHash);
      assert.notStrictEqual(mockUser.passwordResetToken, rawToken); // Never stored raw
    } finally {
      User.findOne = originalFindOne;
      clearSentEmails();
    }
  });

  await t.test("resetPassword rejects invalid or nonexistent token", async () => {
    const originalFindOne = User.findOne;
    User.findOne = async () => null; // Token not found

    const req = { body: { token: "invalid-token-12345", password: "NewStrongPassword123" } };
    const res = createMockRes();

    try {
      await resetPassword(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, "Password reset token is invalid or has expired.");
    } finally {
      User.findOne = originalFindOne;
    }
  });

  await t.test("resetPassword rejects expired token", async () => {
    const originalFindOne = User.findOne;
    // Query requires passwordResetExpires > now, so if expired MongoDB returns null
    User.findOne = async (query) => {
      if (query.passwordResetExpires?.$gt) {
        return null; // Expired!
      }
      return null;
    };

    const req = { body: { token: "expired-token", password: "NewStrongPassword123" } };
    const res = createMockRes();

    try {
      await resetPassword(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, "Password reset token is invalid or has expired.");
    } finally {
      User.findOne = originalFindOne;
    }
  });

  await t.test("resetPassword accepts valid token, updates password, and nullifies reset token", async () => {
    const rawToken = "valid-reset-token-abc123xyz";
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    let saved = false;

    const mockUser = {
      _id: sampleObjectId(),
      email: "citizen@govai.gov",
      password: "old_hashed_password",
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000),
      save: async function () {
        saved = true;
      },
    };

    const originalFindOne = User.findOne;
    User.findOne = async (query) => {
      if (query.passwordResetToken === hashedToken) {
        return mockUser;
      }
      return null;
    };

    const req = { body: { token: rawToken, password: "BrandNewSecurePassword789" } };
    const res = createMockRes();

    try {
      await resetPassword(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(saved, true);
      assert.strictEqual(mockUser.password, "BrandNewSecurePassword789");
      assert.strictEqual(mockUser.passwordResetToken, null); // Token is consumed
      assert.strictEqual(mockUser.passwordResetExpires, null);
    } finally {
      User.findOne = originalFindOne;
    }
  });
});

test("Phase 8.4: 2. Notification Pagination", async (t) => {
  await t.test("listNotifications returns paginated envelope when page/limit requested", async () => {
    const userId = sampleObjectId();
    const originalCount = Notification.countDocuments;
    const originalFind = Notification.find;

    Notification.countDocuments = async () => 5;

    Notification.find = () => ({
      sort: () => ({
        skip: (skipVal) => ({
          limit: async (limitVal) => {
            assert.strictEqual(skipVal, 2);
            assert.strictEqual(limitVal, 2);
            return [
              { _id: sampleObjectId(), message: "Alert 3", read: false },
              { _id: sampleObjectId(), message: "Alert 4", read: true },
            ];
          },
        }),
      }),
    });

    const req = { user: { _id: userId }, query: { page: "2", limit: "2" } };
    const res = createMockRes();

    try {
      await listNotifications(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers["X-Total-Count"], "5");
      assert.strictEqual(res.body.pagination.total, 5);
      assert.strictEqual(res.body.pagination.page, 2);
      assert.strictEqual(res.body.pagination.limit, 2);
      assert.strictEqual(res.body.pagination.totalPages, 3);
      assert.strictEqual(res.body.pagination.hasNextPage, true);
      assert.strictEqual(res.body.pagination.hasPrevPage, true);
      assert.strictEqual(res.body.data.length, 2);
    } finally {
      Notification.countDocuments = originalCount;
      Notification.find = originalFind;
    }
  });

  await t.test("listNotifications preserves array response when unpaginated", async () => {
    const userId = sampleObjectId();
    const originalFind = Notification.find;

    const mockNotifications = Array.from({ length: 50 }, (_, i) => ({
      _id: sampleObjectId(),
      message: `Notification #${i + 1}`,
      read: false,
    }));

    Notification.find = () => ({
      sort: () => ({
        limit: async (lim) => {
          assert.strictEqual(lim, 50);
          return mockNotifications;
        },
      }),
    });

    const req = { user: { _id: userId }, query: {} };
    const res = createMockRes();

    try {
      await listNotifications(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(Array.isArray(res.body), true);
      assert.strictEqual(res.body.length, 50);
    } finally {
      Notification.find = originalFind;
    }
  });
});

test("Phase 8.4: 3. Notification Real-Time Synchronization", async (t) => {
  await t.test("updateNotificationReadState triggers socket read emission", async () => {
    const userId = sampleObjectId();
    const notifId = sampleObjectId();
    let socketEmitted = false;

    const originalFindOneAndUpdate = Notification.findOneAndUpdate;
    Notification.findOneAndUpdate = async () => ({
      _id: notifId,
      userId,
      read: true,
    });

    // Spy on emission
    socketService.setSocketServerForTesting({
      to: (room) => ({
        emit: (event, payload) => {
          assert.strictEqual(room, `user:${userId}`);
          assert.strictEqual(event, "notification-read");
          assert.strictEqual(payload.id, notifId);
          assert.strictEqual(payload.read, true);
          socketEmitted = true;
        },
      }),
    });

    const req = {
      params: { id: notifId },
      user: { _id: userId },
      body: { read: true },
    };
    const res = createMockRes();

    try {
      await updateNotificationReadState(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(socketEmitted, true);
    } finally {
      Notification.findOneAndUpdate = originalFindOneAndUpdate;
      socketService.setSocketServerForTesting(null);
    }
  });

  await t.test("markAllNotificationsRead triggers socket read-all emission", async () => {
    const userId = sampleObjectId();
    let socketEmitted = false;

    const originalUpdateMany = Notification.updateMany;
    Notification.updateMany = async () => ({ modifiedCount: 3 });

    socketService.setSocketServerForTesting({
      to: (room) => ({
        emit: (event, payload) => {
          assert.strictEqual(room, `user:${userId}`);
          assert.strictEqual(event, "notifications-read-all");
          assert.strictEqual(payload.userId, userId);
          socketEmitted = true;
        },
      }),
    });

    const req = { user: { _id: userId } };
    const res = createMockRes();

    try {
      await markAllNotificationsRead(req, res);

      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(socketEmitted, true);
    } finally {
      Notification.updateMany = originalUpdateMany;
      socketService.setSocketServerForTesting(null);
    }
  });

  await t.test("clearNotifications triggers socket cleared emission", async () => {
    const userId = sampleObjectId();
    let socketEmitted = false;

    const originalDeleteMany = Notification.deleteMany;
    Notification.deleteMany = async () => ({ deletedCount: 3 });

    socketService.setSocketServerForTesting({
      to: (room) => ({
        emit: (event, payload) => {
          assert.strictEqual(room, `user:${userId}`);
          assert.strictEqual(event, "notifications-cleared");
          assert.strictEqual(payload.userId, userId);
          socketEmitted = true;
        },
      }),
    });

    const req = { user: { _id: userId } };
    const res = createMockRes();

    try {
      await clearNotifications(req, res);

      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(socketEmitted, true);
    } finally {
      Notification.deleteMany = originalDeleteMany;
      socketService.setSocketServerForTesting(null);
    }
  });
});

test("Phase 8.4: 4. Profile Settings & Persistence", async (t) => {
  await t.test("updateProfile accepts and saves valid phone and name", async () => {
    const userId = sampleObjectId();
    let saved = false;

    const mockUser = {
      _id: userId,
      name: "Old Name",
      phone: "",
      email: "citizen@govai.gov",
      role: "citizen",
      status: "active",
      save: async function () {
        saved = true;
      },
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const req = {
      user: { _id: userId, role: "citizen" },
      body: { name: "Ramesh Gupta", phone: "+91 9876543210" },
    };
    const res = createMockRes();

    try {
      await updateProfile(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(saved, true);
      assert.strictEqual(mockUser.name, "Ramesh Gupta");
      assert.strictEqual(mockUser.phone, "+91 9876543210");
      assert.strictEqual(res.body.user.phone, "+91 9876543210");
    } finally {
      User.findById = originalFindById;
    }
  });

  await t.test("updateProfile rejects invalid phone format with 400", async () => {
    const userId = sampleObjectId();
    const mockUser = {
      _id: userId,
      name: "Ramesh Gupta",
      phone: "",
      save: async () => {},
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const req = {
      user: { _id: userId },
      body: { phone: "not-a-valid-phone-abc" },
    };
    const res = createMockRes();

    try {
      await updateProfile(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, "Invalid phone number format.");
    } finally {
      User.findById = originalFindById;
    }
  });
});
