import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  listNotifications,
  updateNotificationReadState,
  markAllNotificationsRead,
  clearNotifications,
} from "../src/controllers/notification.controller.js";
import { Notification } from "../src/models/Notification.js";

const sampleObjectId = () => new mongoose.Types.ObjectId().toString();

const createMockReqRes = ({ user = {}, params = {}, body = {}, query = {} } = {}) => {
  const req = {
    user,
    params,
    body,
    query,
  };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    send() {
      return this;
    },
  };

  return { req, res, getResult: () => ({ status: statusCode, body: responseData }) };
};

// ==========================================
// 1. LIST NOTIFICATIONS
// ==========================================

test("listNotifications: returns notifications scoped to authenticated user and sorted by createdAt desc", async () => {
  const userId = sampleObjectId();
  const mockNotifications = [
    { _id: sampleObjectId(), userId, message: "Latest notification", createdAt: new Date() },
    { _id: sampleObjectId(), userId, message: "Older notification", createdAt: new Date(Date.now() - 60000) },
  ];

  let queryCaptured = null;
  let sortCaptured = null;
  let limitCaptured = null;

  const origFind = Notification.find;
  Notification.find = (query) => {
    queryCaptured = query;
    return {
      sort(sortOptions) {
        sortCaptured = sortOptions;
        return {
          limit(num) {
            limitCaptured = num;
            return Promise.resolve(mockNotifications);
          },
        };
      },
    };
  };

  try {
    const { req, res, getResult } = createMockReqRes({ user: { _id: userId } });
    await listNotifications(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, mockNotifications);
    assert.equal(queryCaptured.userId, userId);
    assert.deepEqual(sortCaptured, { createdAt: -1 });
    assert.equal(limitCaptured, 50);
  } finally {
    Notification.find = origFind;
  }
});

// ==========================================
// 2. UPDATE NOTIFICATION READ STATE
// ==========================================

test("updateNotificationReadState: rejects invalid notification id format with HTTP 400", async () => {
  const { req, res, getResult } = createMockReqRes({
    user: { _id: sampleObjectId() },
    params: { id: "not-a-valid-id" },
    body: { read: true },
  });

  await updateNotificationReadState(req, res);
  const result = getResult();

  assert.equal(result.status, 400);
  assert.match(result.body.message, /Invalid notification id/i);
});

test("updateNotificationReadState: returns HTTP 404 when notification does not belong to user", async () => {
  const userId = sampleObjectId();
  const notifId = sampleObjectId();

  const origFindOneAndUpdate = Notification.findOneAndUpdate;
  Notification.findOneAndUpdate = async () => null;

  try {
    const { req, res, getResult } = createMockReqRes({
      user: { _id: userId },
      params: { id: notifId },
      body: { read: true },
    });

    await updateNotificationReadState(req, res);
    const result = getResult();

    assert.equal(result.status, 404);
    assert.match(result.body.message, /Notification not found/i);
  } finally {
    Notification.findOneAndUpdate = origFindOneAndUpdate;
  }
});

test("updateNotificationReadState: updates read state for valid owned notification", async () => {
  const userId = sampleObjectId();
  const notifId = sampleObjectId();
  const updatedDoc = { _id: notifId, userId, read: true };

  let filterCaptured = null;
  let updateCaptured = null;

  const origFindOneAndUpdate = Notification.findOneAndUpdate;
  Notification.findOneAndUpdate = async (filter, update) => {
    filterCaptured = filter;
    updateCaptured = update;
    return updatedDoc;
  };

  try {
    const { req, res, getResult } = createMockReqRes({
      user: { _id: userId },
      params: { id: notifId },
      body: { read: true },
    });

    await updateNotificationReadState(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, updatedDoc);
    assert.equal(filterCaptured._id, notifId);
    assert.equal(filterCaptured.userId, userId);
    assert.deepEqual(updateCaptured, { $set: { read: true } });
  } finally {
    Notification.findOneAndUpdate = origFindOneAndUpdate;
  }
});

// ==========================================
// 3. MARK ALL NOTIFICATIONS READ
// ==========================================

test("markAllNotificationsRead: updates all user notifications to read: true with HTTP 204", async () => {
  const userId = sampleObjectId();
  let filterCaptured = null;
  let updateCaptured = null;

  const origUpdateMany = Notification.updateMany;
  Notification.updateMany = async (filter, update) => {
    filterCaptured = filter;
    updateCaptured = update;
    return { modifiedCount: 5 };
  };

  try {
    const { req, res, getResult } = createMockReqRes({ user: { _id: userId } });
    await markAllNotificationsRead(req, res);
    const result = getResult();

    assert.equal(result.status, 204);
    assert.deepEqual(filterCaptured, { userId });
    assert.deepEqual(updateCaptured, { $set: { read: true } });
  } finally {
    Notification.updateMany = origUpdateMany;
  }
});

// ==========================================
// 4. CLEAR NOTIFICATIONS
// ==========================================

test("clearNotifications: deletes only the user's notifications with HTTP 204", async () => {
  const userId = sampleObjectId();
  let filterCaptured = null;

  const origDeleteMany = Notification.deleteMany;
  Notification.deleteMany = async (filter) => {
    filterCaptured = filter;
    return { deletedCount: 5 };
  };

  try {
    const { req, res, getResult } = createMockReqRes({ user: { _id: userId } });
    await clearNotifications(req, res);
    const result = getResult();

    assert.equal(result.status, 204);
    assert.deepEqual(filterCaptured, { userId });
  } finally {
    Notification.deleteMany = origDeleteMany;
  }
});

