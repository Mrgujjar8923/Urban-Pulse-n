import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import {
  authenticateSocket,
  userRoom,
  isPersistedSlaNotification,
  emitNotificationToUser,
  setSocketServerForTesting,
} from "../src/services/notificationSocket.service.js";
import { User } from "../src/models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase6e-test-jwt-secret";
process.env.JWT_SECRET = JWT_SECRET;

const sampleObjectId = () => new mongoose.Types.ObjectId().toString();

// ==========================================
// 1. SOCKET HANDSHAKE AUTHENTICATION
// ==========================================

test("authenticateSocket: rejects connection when auth token is completely missing", async () => {
  const socket = {
    handshake: { auth: {}, headers: {} },
    data: {},
  };

  let caughtError = null;
  await authenticateSocket(socket, (err) => {
    caughtError = err;
  });

  assert.ok(caughtError);
  assert.equal(caughtError.message, "Authentication required");
});

test("authenticateSocket: rejects connection with malformed or invalid JWT", async () => {
  const socket = {
    handshake: { auth: { token: "invalid.jwt.token" }, headers: {} },
    data: {},
  };

  let caughtError = null;
  await authenticateSocket(socket, (err) => {
    caughtError = err;
  });

  assert.ok(caughtError);
  assert.equal(caughtError.message, "Invalid or expired token");
});

test("authenticateSocket: rejects connection when user is not found or deleted", async () => {
  const userId = sampleObjectId();
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve(null),
  });

  try {
    const socket = {
      handshake: { auth: { token }, headers: {} },
      data: {},
    };

    let caughtError = null;
    await authenticateSocket(socket, (err) => {
      caughtError = err;
    });

    assert.ok(caughtError);
    assert.equal(caughtError.message, "Invalid or inactive user");
  } finally {
    User.findById = origFindById;
  }
});

test("authenticateSocket: rejects connection when user account is inactive or pending", async () => {
  const userId = sampleObjectId();
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({ _id: userId, status: "pending", role: "department" }),
  });

  try {
    const socket = {
      handshake: { auth: { token }, headers: {} },
      data: {},
    };

    let caughtError = null;
    await authenticateSocket(socket, (err) => {
      caughtError = err;
    });

    assert.ok(caughtError);
    assert.equal(caughtError.message, "Invalid or inactive user");
  } finally {
    User.findById = origFindById;
  }
});

test("authenticateSocket: accepts valid token, attaches active user, and supports Bearer header", async () => {
  const userId = sampleObjectId();
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });
  const activeUser = { _id: userId, name: "Active Officer", status: "active", role: "department" };

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve(activeUser),
  });

  try {
    const socket = {
      handshake: { auth: {}, headers: { authorization: `Bearer ${token}` } },
      data: {},
    };

    let nextCalled = false;
    let nextError = null;
    await authenticateSocket(socket, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
    assert.deepEqual(socket.data.user, activeUser);
  } finally {
    User.findById = origFindById;
  }
});

// ==========================================
// 2. USER ROOM FORMATTING & ISOLATION
// ==========================================

test("userRoom: formats user room correctly with stringified ObjectId", () => {
  const rawId = sampleObjectId();
  assert.equal(userRoom(rawId), `user:${rawId}`);
  assert.equal(userRoom(new mongoose.Types.ObjectId(rawId)), `user:${rawId}`);
});

// ==========================================
// 3. SLA OVERDUE NOTIFICATION VALIDATION
// ==========================================

test("isPersistedSlaNotification: validates persisted SLA notification prerequisites", () => {
  const validNotif = {
    _id: sampleObjectId(),
    isNew: false,
    meta: {
      type: "sla_overdue",
      department: "Water Supply",
    },
  };
  assert.equal(isPersistedSlaNotification(validNotif), true);

  // Missing _id
  assert.equal(isPersistedSlaNotification({ ...validNotif, _id: null }), false);
  // isNew is true (unpersisted)
  assert.equal(isPersistedSlaNotification({ ...validNotif, isNew: true }), false);
  // Wrong meta type
  assert.equal(isPersistedSlaNotification({ ...validNotif, meta: { type: "complaint_status" } }), false);
  // Missing department
  assert.equal(isPersistedSlaNotification({ ...validNotif, meta: { type: "sla_overdue", department: "" } }), false);
});

// ==========================================
// 4. EMIT NOTIFICATION TO USER
// ==========================================

test("emitNotificationToUser: returns false when socket io is uninitialized or userId missing", async () => {
  setSocketServerForTesting(null);
  assert.equal(await emitNotificationToUser(null), false);
  assert.equal(await emitNotificationToUser({ userId: null }), false);
});

test("emitNotificationToUser: emits standard notification to user room", async () => {
  const recipientId = sampleObjectId();
  let emittedRoom = null;
  let emittedEvent = null;
  let emittedPayload = null;

  const mockIo = {
    to(room) {
      emittedRoom = room;
      return {
        emit(event, payload) {
          emittedEvent = event;
          emittedPayload = payload;
        },
      };
    },
  };

  setSocketServerForTesting(mockIo);

  try {
    const notification = {
      _id: sampleObjectId(),
      userId: recipientId,
      message: "Standard alert",
      meta: { type: "complaint_submitted" },
    };

    const outcome = await emitNotificationToUser(notification);
    assert.equal(outcome, true);
    assert.equal(emittedRoom, `user:${recipientId}`);
    assert.equal(emittedEvent, "new-notification");
    assert.deepEqual(emittedPayload, notification);
  } finally {
    setSocketServerForTesting(null);
  }
});

test("emitNotificationToUser: authorizes SLA overdue notification for active admin", async () => {
  const adminId = sampleObjectId();
  let emittedRoom = null;

  const mockIo = {
    to(room) {
      emittedRoom = room;
      return {
        emit() {},
      };
    },
  };

  setSocketServerForTesting(mockIo);

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: adminId, role: "admin", status: "active" }),
    }),
  });

  try {
    const slaNotif = {
      _id: sampleObjectId(),
      userId: adminId,
      message: "Complaint overdue",
      meta: { type: "sla_overdue", department: "Roads" },
    };

    const outcome = await emitNotificationToUser(slaNotif);
    assert.equal(outcome, true);
    assert.equal(emittedRoom, `user:${adminId}`);
  } finally {
    setSocketServerForTesting(null);
    User.findById = origFindById;
  }
});

test("emitNotificationToUser: rejects SLA overdue notification when recipient is citizen or mismatched department", async () => {
  const citizenId = sampleObjectId();
  const mockIo = {
    to() {
      return { emit() {} };
    },
  };

  setSocketServerForTesting(mockIo);

  const origFindById = User.findById;

  // 1. Citizen recipient rejection
  User.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: citizenId, role: "citizen", status: "active" }),
    }),
  });

  try {
    const slaNotif = {
      _id: sampleObjectId(),
      userId: citizenId,
      message: "Complaint overdue",
      meta: { type: "sla_overdue", department: "Roads" },
    };

    const outcome1 = await emitNotificationToUser(slaNotif);
    assert.equal(outcome1, false, "Citizen must NOT receive SLA overdue alert");

    // 2. Mismatched department rejection
    User.findById = () => ({
      select: () => ({
        lean: async () => ({ _id: citizenId, role: "department", department: "Water Supply", status: "active" }),
      }),
    });

    const outcome2 = await emitNotificationToUser(slaNotif);
    assert.equal(outcome2, false, "Department mismatch must NOT receive SLA overdue alert");
  } finally {
    setSocketServerForTesting(null);
    User.findById = origFindById;
  }
});

