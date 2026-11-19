import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../src/app.js";
import { User } from "../src/models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase6f-test-jwt-secret";
process.env.JWT_SECRET = JWT_SECRET;

const sampleId = () => new mongoose.Types.ObjectId().toString();

const withRunningServer = async (callback) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const createAuthToken = (userPayload) => {
  return jwt.sign(userPayload, JWT_SECRET, { expiresIn: "1h" });
};

test("System Error Handling: malformed JSON payload returns HTTP 400 with 'Invalid JSON payload'", async () => {
  await withRunningServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: '{"email": "broken-json", "password": ', // malformed JSON
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.message, "Invalid JSON payload");
    // Ensure no stack trace or internal parser traces are leaked
    assert.equal(data.stack, undefined);
  });
});

test("System Error Handling: route 404 returns HTTP 404 with structured JSON", async () => {
  await withRunningServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/nonexistent-route-for-testing`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.message, "Route not found");
  });
});

test("System Error Handling: PUT /api/auth/department-requests/:id rejects invalid MongoId with HTTP 400", async () => {
  const adminId = sampleId();
  const token = createAuthToken({ id: adminId, role: "admin" });

  const origFindById = User.findById;
  User.findById = (_id) => ({
    select: () => Promise.resolve({
      _id: adminId,
      role: "admin",
      status: "active",
      name: "Admin User",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/department-requests/invalid-mongo-id`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "active" }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(Array.isArray(data.errors));
      const idError = data.errors.find((err) => err.path === "id");
      assert.ok(idError);
      assert.equal(idError.msg, "Invalid ID");
    });
  } finally {
    User.findById = origFindById;
  }
});

test("System Error Handling: PUT /api/auth/users/:id/department-role rejects invalid MongoId with HTTP 400", async () => {
  const adminId = sampleId();
  const token = createAuthToken({ id: adminId, role: "admin" });

  const origFindById = User.findById;
  User.findById = (_id) => ({
    select: () => Promise.resolve({
      _id: adminId,
      role: "admin",
      status: "active",
      name: "Admin User",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/users/not-a-valid-id/department-role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ departmentRole: "officer" }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(Array.isArray(data.errors));
      const idError = data.errors.find((err) => err.path === "id");
      assert.ok(idError);
      assert.equal(idError.msg, "Invalid ID");
    });
  } finally {
    User.findById = origFindById;
  }
});

test("System Error Handling: PUT /api/auth/department-requests/:id enforces RBAC (401 unauthenticated, 403 non-admin)", async () => {
  const validMongoId = sampleId();
  const citizenToken = createAuthToken({ id: sampleId(), role: "citizen" });

  const origFindById = User.findById;
  User.findById = (_id) => ({
    select: () => Promise.resolve({
      _id,
      role: "citizen",
      status: "active",
      name: "Citizen User",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      // 1. Unauthenticated -> 401
      const resNoAuth = await fetch(`${baseUrl}/api/auth/department-requests/${validMongoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      assert.equal(resNoAuth.status, 401);

      // 2. Citizen role -> 403 Forbidden
      const resCitizen = await fetch(`${baseUrl}/api/auth/department-requests/${validMongoId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ status: "active" }),
      });
      assert.equal(resCitizen.status, 403);
    });
  } finally {
    User.findById = origFindById;
  }
});

