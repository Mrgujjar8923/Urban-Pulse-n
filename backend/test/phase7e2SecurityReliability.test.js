import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import app from "../src/app.js";
import { gracefulShutdown } from "../src/server.js";
import { createCustomRateLimiter } from "../src/middleware/rateLimit.middleware.js";
import { startOverdueSlaJob, stopOverdueSlaJob } from "../src/services/slaEscalation.service.js";

const withRunningServer = async (testApp, callback) => {
  const server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

// ============================================================================
// 1. HTTP SECURITY HEADERS (HELMET)
// ============================================================================
test("Phase 7E.2: Helmet sets secure HTTP response headers", async () => {
  await withRunningServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "cross-origin");
    // Ensure X-Powered-By is removed by Helmet
    assert.equal(res.headers.get("x-powered-by"), null);
  });
});

// ============================================================================
// 2. DEEP HEALTH CHECK (DB CONNECTED & DISCONNECTED)
// ============================================================================
test("Phase 7E.2: /health returns HTTP 200 with 'connected' when mongoose.connection.readyState is 1", async () => {
  const originalState = mongoose.connection.readyState;
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

  try {
    await withRunningServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data, {
        status: "ok",
        database: "connected",
      });
    });
  } finally {
    Object.defineProperty(mongoose.connection, "readyState", { value: originalState, configurable: true });
  }
});

test("Phase 7E.2: /health returns HTTP 503 with 'disconnected' when mongoose.connection.readyState is not 1", async () => {
  const originalState = mongoose.connection.readyState;
  Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });

  try {
    await withRunningServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.deepEqual(data, {
        status: "degraded",
        database: "disconnected",
      });
      // Verify no sensitive connection details or credentials leaked
      assert.equal(data.uri, undefined);
      assert.equal(data.host, undefined);
      assert.equal(data.stack, undefined);
    });
  } finally {
    Object.defineProperty(mongoose.connection, "readyState", { value: originalState, configurable: true });
  }
});

// ============================================================================
// 3. RATE LIMITING ON AUTH (LOGIN & REGISTRATION)
// ============================================================================
test("Phase 7E.2: Rate Limiting rejects brute-force login attempts with HTTP 429 and standard headers", async () => {
  const testApp = express();
  testApp.use(express.json());
  const strictLoginLimiter = createCustomRateLimiter({
    windowMs: 60000,
    max: 3,
    message: "Too many login attempts. Please try again after 15 minutes.",
  });
  testApp.post("/api/auth/login", strictLoginLimiter, (_req, res) => {
    res.status(401).json({ message: "Invalid credentials" });
  });

  await withRunningServer(testApp, async (baseUrl) => {
    // Attempts 1, 2, 3 should return 401
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "attacker@test.com", password: "wrong" }),
      });
      assert.equal(res.status, 401);
    }

    // Attempt 4 must be blocked with HTTP 429 Too Many Requests
    const blockedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "attacker@test.com", password: "wrong" }),
    });

    assert.equal(blockedRes.status, 429);
    const body = await blockedRes.json();
    assert.equal(body.message, "Too many login attempts. Please try again after 15 minutes.");
    assert.ok(blockedRes.headers.has("ratelimit-limit"));
    assert.ok(blockedRes.headers.has("ratelimit-remaining"));
  });
});

test("Phase 7E.2: Rate Limiting rejects registration spam with HTTP 429", async () => {
  const testApp = express();
  testApp.use(express.json());
  const strictRegisterLimiter = createCustomRateLimiter({
    windowMs: 60000,
    max: 2,
    message: "Too many registration attempts.",
  });
  testApp.post("/api/auth/register", strictRegisterLimiter, (_req, res) => {
    res.status(201).json({ message: "Account created" });
  });

  await withRunningServer(testApp, async (baseUrl) => {
    // 2 allowed
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "User", email: `user${i}@test.com` }),
      });
      assert.equal(res.status, 201);
    }

    // 3rd blocked
    const blocked = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "User", email: "user3@test.com" }),
    });
    assert.equal(blocked.status, 429);
    const data = await blocked.json();
    assert.equal(data.message, "Too many registration attempts.");
  });
});

// ============================================================================
// 4. RATE LIMITING ON ASSISTANT & COMPLAINTS
// ============================================================================
test("Phase 7E.2: Rate Limiting throttles excessive assistant queries with HTTP 429", async () => {
  const testApp = express();
  testApp.use(express.json());
  const strictAssistantLimiter = createCustomRateLimiter({
    windowMs: 60000,
    max: 2,
    message: "Too many assistant queries. Please wait a moment before sending another query.",
  });
  testApp.post("/api/assistant/chat", strictAssistantLimiter, (_req, res) => {
    res.status(200).json({ reply: "Hello, I am GovAI Assistant." });
  });

  await withRunningServer(testApp, async (baseUrl) => {
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${baseUrl}/api/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hi" }),
      });
      assert.equal(res.status, 200);
    }

    const blocked = await fetch(`${baseUrl}/api/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hi again" }),
    });
    assert.equal(blocked.status, 429);
    const data = await blocked.json();
    assert.equal(data.message, "Too many assistant queries. Please wait a moment before sending another query.");
  });
});

test("Phase 7E.2: Rate Limiting throttles rapid complaint creation with HTTP 429", async () => {
  const testApp = express();
  testApp.use(express.json());
  const strictComplaintLimiter = createCustomRateLimiter({
    windowMs: 60000,
    max: 2,
    message: "Too many complaints submitted. Please try again after 15 minutes.",
  });
  testApp.post("/api/complaints", strictComplaintLimiter, (_req, res) => {
    res.status(201).json({ id: "cmp-100", title: "New Complaint" });
  });

  await withRunningServer(testApp, async (baseUrl) => {
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Issue ${i}` }),
      });
      assert.equal(res.status, 201);
    }

    const blocked = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Issue 3" }),
    });
    assert.equal(blocked.status, 429);
    const data = await blocked.json();
    assert.equal(data.message, "Too many complaints submitted. Please try again after 15 minutes.");
  });
});

// ============================================================================
// 5. GRACEFUL SHUTDOWN & CLEANUP
// ============================================================================
test("Phase 7E.2: Graceful shutdown cleans up timers and connections cleanly without throwing", async () => {
  // Start a test SLA escalation job to verify stopOverdueSlaJob cleans it
  startOverdueSlaJob({ intervalMs: 30000 });
  stopOverdueSlaJob();

  // Test gracefulShutdown does not throw and completes
  await gracefulShutdown("SIGTERM", { exit: false });

  // Verify duplicate shutdown is safely ignored without throwing
  await gracefulShutdown("SIGINT", { exit: false });
});
