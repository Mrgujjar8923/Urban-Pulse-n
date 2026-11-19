import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { authMiddleware, isActiveAccount } from "../src/middleware/auth.middleware.js";
import { User } from "../src/models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase6c-test-jwt-secret";
process.env.JWT_SECRET = JWT_SECRET;

const createMockReqRes = (authHeader) => {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  let responseStatus = null;
  let responseJson = null;
  let nextCalled = false;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  const next = () => {
    nextCalled = true;
  };

  return { req, res, next, getResult: () => ({ status: responseStatus, json: responseJson, nextCalled }) };
};

test("protected API access requires an explicitly active account", () => {
  assert.equal(isActiveAccount({ status: "active" }), true);
  assert.equal(isActiveAccount({ status: "inactive" }), false);
  assert.equal(isActiveAccount({ status: "pending" }), false);
  assert.equal(isActiveAccount({ status: "rejected" }), false);
  assert.equal(isActiveAccount({}), false);
  assert.equal(isActiveAccount(null), false);
});

test("authMiddleware: rejects request when Authorization header is completely missing with 401", async () => {
  const { req, res, next, getResult } = createMockReqRes(undefined);
  await authMiddleware(req, res, next);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.json.message, "Authorization token missing");
  assert.equal(result.nextCalled, false);
});

test("authMiddleware: rejects request with non-Bearer scheme (e.g. Basic auth) with 401", async () => {
  const { req, res, next, getResult } = createMockReqRes("Basic dXNlcjpwYXNz");
  await authMiddleware(req, res, next);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.json.message, "Authorization token missing");
  assert.equal(result.nextCalled, false);
});

test("authMiddleware: rejects malformed JWT string with 401", async () => {
  const { req, res, next, getResult } = createMockReqRes("Bearer not.a.valid.jwt.string");
  await authMiddleware(req, res, next);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.json.message, "Invalid or expired token");
  assert.equal(result.nextCalled, false);
});

test("authMiddleware: rejects JWT signed with an invalid signature with 401", async () => {
  const fakeToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, "completely-wrong-secret-key");
  const { req, res, next, getResult } = createMockReqRes(`Bearer ${fakeToken}`);
  await authMiddleware(req, res, next);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.json.message, "Invalid or expired token");
  assert.equal(result.nextCalled, false);
});

test("authMiddleware: rejects expired JWT with 401", async () => {
  const expiredToken = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString() },
    JWT_SECRET,
    { expiresIn: "-10s" }
  );
  const { req, res, next, getResult } = createMockReqRes(`Bearer ${expiredToken}`);
  await authMiddleware(req, res, next);
  const result = getResult();
  assert.equal(result.status, 401);
  assert.equal(result.json.message, "Invalid or expired token");
  assert.equal(result.nextCalled, false);
});

test("authMiddleware: rejects token referencing a deleted or non-existent user with 401", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const validToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });

  const originalFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve(null),
  });

  try {
    const { req, res, next, getResult } = createMockReqRes(`Bearer ${validToken}`);
    await authMiddleware(req, res, next);
    const result = getResult();
    assert.equal(result.status, 401);
    assert.equal(result.json.message, "Invalid token");
    assert.equal(result.nextCalled, false);
  } finally {
    User.findById = originalFindById;
  }
});

test("authMiddleware: rejects token for pending or rejected user account with 403", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const validToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });

  const originalFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({ _id: userId, status: "pending", role: "department" }),
  });

  try {
    const { req, res, next, getResult } = createMockReqRes(`Bearer ${validToken}`);
    await authMiddleware(req, res, next);
    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.json.message, "Account is not active");
    assert.equal(result.nextCalled, false);
  } finally {
    User.findById = originalFindById;
  }
});

test("authMiddleware: accepts valid token for active user, attaches req.user, and calls next()", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const validToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1h" });
  const activeUser = {
    _id: userId,
    name: "Active Citizen",
    email: "active.citizen@govai.gov",
    status: "active",
    role: "citizen",
  };

  const originalFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve(activeUser),
  });

  try {
    const { req, res, next, getResult } = createMockReqRes(`Bearer ${validToken}`);
    await authMiddleware(req, res, next);
    const result = getResult();
    assert.equal(result.status, null);
    assert.equal(result.nextCalled, true);
    assert.equal(req.user._id, userId);
    assert.equal(req.user.name, "Active Citizen");
  } finally {
    User.findById = originalFindById;
  }
});
