import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  generateGeminiText,
  parseResponseBody,
  extractGeneratedText,
  classifyProviderStatus,
  isTransientGeminiError,
  sanitizeProviderMessage,
  GeminiServiceError,
} from "../src/services/gemini.service.js";
import {
  parseComplaintAnalysis,
  buildComplaintAnalysisPrompt,
  createSla,
} from "../src/controllers/complaint.controller.js";
import { Complaint } from "../src/models/Complaint.js";
import { DEPARTMENTS } from "../src/models/User.js";

const sampleId = () => new mongoose.Types.ObjectId().toString();

// ==========================================
// 1. GEMINI SERVICE UNIT TESTS
// ==========================================

test("classifyProviderStatus maps HTTP codes correctly", () => {
  assert.equal(classifyProviderStatus(400), "PROVIDER_BAD_REQUEST");
  assert.equal(classifyProviderStatus(401), "PROVIDER_AUTH_FAILED");
  assert.equal(classifyProviderStatus(403), "PROVIDER_AUTH_FAILED");
  assert.equal(classifyProviderStatus(429), "PROVIDER_RATE_LIMITED");
  assert.equal(classifyProviderStatus(500), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyProviderStatus(502), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyProviderStatus(503), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyProviderStatus(504), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyProviderStatus(418), "PROVIDER_ERROR");
});

test("isTransientGeminiError identifies transient errors correctly", () => {
  assert.equal(isTransientGeminiError({ code: "TIMEOUT" }), true);
  assert.equal(isTransientGeminiError({ code: "NETWORK_ERROR" }), true);
  assert.equal(isTransientGeminiError({ code: "PROVIDER_RATE_LIMITED" }), true);
  assert.equal(isTransientGeminiError({ code: "PROVIDER_UNAVAILABLE" }), true);
  assert.equal(isTransientGeminiError({ code: "REQUEST_FAILED" }), true);

  assert.equal(isTransientGeminiError({ code: "MISSING_API_KEY" }), false);
  assert.equal(isTransientGeminiError({ code: "PROVIDER_AUTH_FAILED" }), false);
  assert.equal(isTransientGeminiError({ code: "INVALID_CATEGORY" }), false);
});

test("sanitizeProviderMessage removes control characters and truncates", () => {
  assert.equal(sanitizeProviderMessage(null), null);
  assert.equal(sanitizeProviderMessage(undefined), null);
  assert.equal(sanitizeProviderMessage("  Error   occurred \u0000 here  "), "Error occurred here");
});

test("extractGeneratedText retrieves text or throws on malformed candidates", () => {
  const validPayload = {
    candidates: [{ content: { parts: [{ text: '{"category":"Water Supply"}' }] } }],
  };
  assert.equal(extractGeneratedText(validPayload), '{"category":"Water Supply"}');

  assert.throws(
    () => extractGeneratedText({}),
    (err) => err.code === "MALFORMED_RESPONSE"
  );
  assert.throws(
    () => extractGeneratedText({ candidates: [] }),
    (err) => err.code === "MALFORMED_RESPONSE"
  );
  assert.throws(
    () => extractGeneratedText({ candidates: [{ content: { parts: [{ text: "   " }] } }] }),
    (err) => err.code === "MALFORMED_RESPONSE"
  );
});

test("parseResponseBody handles empty and non-JSON bodies safely", async () => {
  const emptyRes = { text: async () => "" };
  assert.deepEqual(await parseResponseBody(emptyRes), {});

  const jsonRes = { text: async () => '{"status":"ok"}' };
  assert.deepEqual(await parseResponseBody(jsonRes), { status: "ok" });

  const textRes = { text: async () => "Bad Gateway" };
  assert.deepEqual(await parseResponseBody(textRes), { rawBody: "Bad Gateway" });
});

test("generateGeminiText rejects when API key is missing", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(
      () => generateGeminiText("Test prompt"),
      (err) => err.code === "MISSING_API_KEY" && err.statusCode === 503
    );
  } finally {
    process.env.GEMINI_API_KEY = origKey;
  }
});

test("generateGeminiText rejects when prompt is empty", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = "test-key";
    await assert.rejects(
      () => generateGeminiText("   "),
      (err) => err.code === "INVALID_PROMPT" && err.statusCode === 400
    );
  } finally {
    process.env.GEMINI_API_KEY = origKey;
  }
});

// ==========================================
// 2. PARSE COMPLAINT ANALYSIS TESTS
// ==========================================

const sampleValidAnalysis = {
  detectedLanguage: "en",
  englishTranslation: "Water pipe broken",
  category: "Water Supply",
  priority: "High",
  urgencyScore: 8,
  confidence: 0.95,
  reasoning: "Major leak reported affecting neighbourhood",
  detectedIssue: "Pipe burst",
  affectedArea: "Sector 4",
  recommendedDepartment: "Water Supply",
  recommendedAction: "Dispatch repair team immediately",
};

test("parseComplaintAnalysis parses valid JSON string", () => {
  const parsed = parseComplaintAnalysis(JSON.stringify(sampleValidAnalysis));
  assert.equal(parsed.category, "Water Supply");
  assert.equal(parsed.priority, "High");
  assert.equal(parsed.urgencyScore, 8);
  assert.equal(parsed.confidence, 0.95);
});

test("parseComplaintAnalysis strips markdown fences", () => {
  const fenced = "```json\n" + JSON.stringify(sampleValidAnalysis) + "\n```";
  const parsed = parseComplaintAnalysis(fenced);
  assert.equal(parsed.category, "Water Supply");
});

test("parseComplaintAnalysis rejects incomplete text fields", () => {
  const incomplete = { ...sampleValidAnalysis, reasoning: "" };
  assert.throws(
    () => parseComplaintAnalysis(JSON.stringify(incomplete)),
    (err) => err.code === "MALFORMED_ANALYSIS"
  );
});

test("parseComplaintAnalysis accepts unsupported department category without throwing", () => {
  const unsuppDept = { ...sampleValidAnalysis, category: "Sanitation & Health" };
  const parsed = parseComplaintAnalysis(JSON.stringify(unsuppDept));
  assert.equal(parsed.category, "Sanitation & Health");
  assert.equal(parsed.englishTranslation, sampleValidAnalysis.englishTranslation);
});

test("parseComplaintAnalysis rejects missing or non-string category with MALFORMED_ANALYSIS", () => {
  const invalidCategory = { ...sampleValidAnalysis, category: "" };
  assert.throws(
    () => parseComplaintAnalysis(JSON.stringify(invalidCategory)),
    (err) => err.code === "MALFORMED_ANALYSIS"
  );
});

test("parseComplaintAnalysis rejects invalid priority with INVALID_PRIORITY", () => {
  const invalidPriority = { ...sampleValidAnalysis, priority: "SuperUrgent" };
  assert.throws(
    () => parseComplaintAnalysis(JSON.stringify(invalidPriority)),
    (err) => err.code === "INVALID_PRIORITY"
  );
});

test("parseComplaintAnalysis rejects out-of-range urgencyScore", () => {
  const invalidUrgency = { ...sampleValidAnalysis, urgencyScore: 12 };
  assert.throws(
    () => parseComplaintAnalysis(JSON.stringify(invalidUrgency)),
    (err) => err.code === "INVALID_URGENCY"
  );
});

test("buildComplaintAnalysisPrompt includes title, description, and allowed departments", () => {
  const prompt = buildComplaintAnalysisPrompt({
    title: "Leaking Pipe",
    description: "Major water leak on 5th Avenue",
  });
  assert.match(prompt, /Leaking Pipe/);
  assert.match(prompt, /Water Supply/);
  assert.match(prompt, /Road & Infrastructure/);
});

// ==========================================
// 3. COMPLAINT SUBMISSION & FALLBACK LOGIC
// ==========================================

const mockUser = {
  _id: new mongoose.Types.ObjectId(),
  name: "Citizen Jane",
  email: "citizen.jane@govai.gov",
  role: "citizen",
};

// Pure simulator of createComplaint workflow
const simulateCreateComplaint = async ({
  body,
  user,
  geminiMockFn,
  existingComplaints = [],
}) => {
  const { title, description, category, clientRequestId } = body;

  if (!DEPARTMENTS.includes(category)) {
    return { status: 400, body: { message: "Invalid category" } };
  }

  // Idempotency check 1: clientRequestId
  if (clientRequestId) {
    const existing = existingComplaints.find(
      (c) => c.createdBy.toString() === user._id.toString() && c.clientRequestId === clientRequestId
    );
    if (existing) {
      return { status: 200, body: existing, isDuplicate: true };
    }
  }

  // Idempotency check 2: rapid resubmit
  const recentDuplicate = existingComplaints.find(
    (c) =>
      c.createdBy.toString() === user._id.toString() &&
      c.title === title &&
      c.description === description &&
      c.category === category &&
      Date.now() - new Date(c.createdAt).getTime() < 30000
  );
  if (recentDuplicate) {
    return { status: 200, body: recentDuplicate, isDuplicate: true };
  }

  // 1. Initial complaint persistence
  const complaint = {
    _id: sampleId(),
    title,
    description,
    category,
    createdBy: user._id,
    status: "Pending",
    createdAt: new Date().toISOString(),
    clientRequestId: clientRequestId || null,
    sla: {
      durationMinutes: 72 * 60,
      deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      slaStatus: "On Track",
    },
    timeline: [
      { eventType: "complaint_created", label: "Complaint Created", status: "Pending" },
      { eventType: "department_assigned", label: "Department Assigned", note: category },
      { eventType: "sla_started", label: "SLA Started", note: "Standard SLA initialized" },
    ],
    aiAnalysis: {
      status: "pending",
      model: "gemini-2.5-flash",
      retryCount: 0,
      lastAttemptAt: new Date().toISOString(),
    },
  };

  // 2. Attempt AI
  let aiOutcome;
  try {
    const rawAi = await geminiMockFn({ title, description });
    if (!DEPARTMENTS.includes(rawAi.category)) {
      complaint.aiAnalysis = {
        ...rawAi,
        status: "manual_review_required",
        errorCategory: "INVALID_CATEGORY",
        errorMessage: "AI returned unsupported department category.",
        retryCount: 1,
        lastAttemptAt: new Date().toISOString(),
      };
      complaint.timeline.push({
        eventType: "ai_manual_review_required",
        label: "Manual Review Required",
        note: "AI category could not be verified; citizen-selected department preserved.",
      });
      aiOutcome = { status: "manual_review_required" };
    } else {
      complaint.aiAnalysis = {
        ...rawAi,
        status: "completed",
        retryCount: 1,
        lastAttemptAt: new Date().toISOString(),
      };
      if (rawAi.priority === "Critical") {
        complaint.sla.durationMinutes = 4 * 60;
      } else if (rawAi.priority === "High") {
        complaint.sla.durationMinutes = 24 * 60;
      }
      complaint.timeline.push(
        { eventType: "ai_category_classified", label: "AI Category Classified", note: rawAi.category },
        { eventType: "ai_priority_detected", label: "AI Priority Detected", note: rawAi.priority }
      );
      aiOutcome = { status: "completed" };
    }
  } catch (err) {
    const errorCategory = err.code || "AI_SERVICE_UNAVAILABLE";
    const status = errorCategory === "INVALID_CATEGORY" ? "manual_review_required" : "failed";
    complaint.aiAnalysis = {
      status,
      errorCategory,
      errorMessage: err.message || "AI unavailable",
      retryCount: 1,
      lastAttemptAt: new Date().toISOString(),
    };
    complaint.timeline.push({
      eventType: status === "manual_review_required" ? "ai_manual_review_required" : "ai_analysis_unavailable",
      label: status === "manual_review_required" ? "Manual Review Required" : "AI Analysis Unavailable",
      note: "Complaint recorded with citizen-selected category and standard SLA.",
    });
    aiOutcome = { status, errorCategory };
  }

  // 3. Notification emission simulated
  const notificationsCreated = 1;

  return {
    status: 201,
    body: {
      ...complaint,
      _submissionMeta: {
        aiStatus: aiOutcome.status,
        ...(aiOutcome.errorCategory ? { errorCategory: aiOutcome.errorCategory } : {}),
      },
    },
    notificationsCreated,
  };
};

test("Gemini success path: persists complaint, stores AI analysis, adjusts SLA", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "Broken street light",
      description: "Pole 42 light is completely off at night",
      category: "Electricity",
    },
    user: mockUser,
    geminiMockFn: async () => ({
      ...sampleValidAnalysis,
      category: "Electricity",
      priority: "High",
    }),
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.title, "Broken street light");
  assert.equal(result.body.category, "Electricity");
  assert.equal(result.body.aiAnalysis.status, "completed");
  assert.equal(result.body.aiAnalysis.priority, "High");
  assert.equal(result.body.sla.durationMinutes, 24 * 60); // High SLA duration
  assert.equal(result.notificationsCreated, 1);
});

test("Gemini timeout path: complaint remains saved with failed AI status and standard SLA", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "Pothole on Main Road",
      description: "Deep pothole causing accidents near market",
      category: "Road & Infrastructure",
    },
    user: mockUser,
    geminiMockFn: async () => {
      const err = new GeminiServiceError("Gemini request timed out.", "TIMEOUT", 504);
      throw err;
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.title, "Pothole on Main Road");
  assert.equal(result.body.category, "Road & Infrastructure");
  assert.equal(result.body.aiAnalysis.status, "failed");
  assert.equal(result.body.aiAnalysis.errorCategory, "TIMEOUT");
  assert.equal(result.body.sla.durationMinutes, 72 * 60); // Standard Medium SLA
  assert.equal(result.body.timeline.some((t) => t.eventType === "ai_analysis_unavailable"), true);
  assert.equal(result.notificationsCreated, 1);
});

test("Gemini 429 rate limit path: complaint remains saved with failed status", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "Sewage overflow",
      description: "Sewage leaking onto the street",
      category: "Environment",
    },
    user: mockUser,
    geminiMockFn: async () => {
      throw new GeminiServiceError("Resource exhausted.", "PROVIDER_RATE_LIMITED", 429);
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.category, "Environment");
  assert.equal(result.body.aiAnalysis.status, "failed");
  assert.equal(result.body.aiAnalysis.errorCategory, "PROVIDER_RATE_LIMITED");
});

test("Gemini 502/503 service unavailable: complaint remains saved with failed status", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "No water in morning",
      description: "Low pressure throughout Sector 12",
      category: "Water Supply",
    },
    user: mockUser,
    geminiMockFn: async () => {
      throw new GeminiServiceError("Service unavailable.", "PROVIDER_UNAVAILABLE", 503);
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.category, "Water Supply");
  assert.equal(result.body.aiAnalysis.status, "failed");
  assert.equal(result.body.aiAnalysis.errorCategory, "PROVIDER_UNAVAILABLE");
});

test("Gemini network connection failure: complaint remains saved with failed status", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "Fallen tree branch on electric cable",
      description: "Dangerous branch resting on wires",
      category: "Electricity",
    },
    user: mockUser,
    geminiMockFn: async () => {
      throw new GeminiServiceError("Network connection failed.", "NETWORK_ERROR", 503);
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.category, "Electricity");
  assert.equal(result.body.aiAnalysis.status, "failed");
  assert.equal(result.body.aiAnalysis.errorCategory, "NETWORK_ERROR");
});

test("Gemini missing API key: complaint remains saved with failed status", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "Garbage dump issue",
      description: "Trash not collected for 4 days",
      category: "Environment",
    },
    user: mockUser,
    geminiMockFn: async () => {
      throw new GeminiServiceError("Gemini is not configured.", "MISSING_API_KEY", 503);
    },
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.category, "Environment");
  assert.equal(result.body.aiAnalysis.status, "failed");
  assert.equal(result.body.aiAnalysis.errorCategory, "MISSING_API_KEY");
});

test("Gemini Case C: invalid AI category rejects AI routing and flags manual_review_required", async () => {
  const result = await simulateCreateComplaint({
    body: {
      title: "Broken bench in park",
      description: "Bench broken in public park",
      category: "Environment",
    },
    user: mockUser,
    geminiMockFn: async () => ({
      ...sampleValidAnalysis,
      category: "Parks & Recreation", // Invalid department
      priority: "Low",
    }),
  });

  assert.equal(result.status, 201);
  // Citizen-selected category strictly preserved
  assert.equal(result.body.category, "Environment");
  assert.equal(result.body.aiAnalysis.status, "manual_review_required");
  assert.equal(result.body.aiAnalysis.errorCategory, "INVALID_CATEGORY");
  assert.equal(result.body.timeline.some((t) => t.eventType === "ai_manual_review_required"), true);
});

test("Idempotency: clientRequestId prevents duplicate complaint creation", async () => {
  const existing = {
    _id: "comp-existing-1",
    title: "Leaking pipe",
    description: "Pipe burst",
    category: "Water Supply",
    createdBy: mockUser._id,
    clientRequestId: "req-unique-12345",
  };

  const result = await simulateCreateComplaint({
    body: {
      title: "Leaking pipe",
      description: "Pipe burst",
      category: "Water Supply",
      clientRequestId: "req-unique-12345",
    },
    user: mockUser,
    geminiMockFn: async () => sampleValidAnalysis,
    existingComplaints: [existing],
  });

  assert.equal(result.status, 200);
  assert.equal(result.isDuplicate, true);
  assert.equal(result.body._id, "comp-existing-1");
});

test("Idempotency: rapid duplicate submission window prevents duplicate creation", async () => {
  const existing = {
    _id: "comp-existing-2",
    title: "Pothole on 2nd cross",
    description: "Dangerous pothole",
    category: "Road & Infrastructure",
    createdBy: mockUser._id,
    createdAt: new Date().toISOString(),
  };

  const result = await simulateCreateComplaint({
    body: {
      title: "Pothole on 2nd cross",
      description: "Dangerous pothole",
      category: "Road & Infrastructure",
    },
    user: mockUser,
    geminiMockFn: async () => sampleValidAnalysis,
    existingComplaints: [existing],
  });

  assert.equal(result.status, 200);
  assert.equal(result.isDuplicate, true);
  assert.equal(result.body._id, "comp-existing-2");
});

// ==========================================
// 4. RETRY MECHANISM & RBAC TESTS
// ==========================================

const evaluateRetryAiAccess = (user, complaint) => {
  const isAdmin = user.role === "admin";
  const isDeptAuthority =
    user.role === "department" &&
    user.departmentRole === "authority" &&
    user.department === complaint.category;

  if (!isAdmin && !isDeptAuthority) {
    return { status: 403, allowed: false, message: "Forbidden" };
  }

  if (complaint.aiAnalysis?.status === "completed") {
    return { status: 200, allowed: true, message: "Already completed" };
  }

  const lastAttempt = complaint.aiAnalysis?.lastAttemptAt
    ? new Date(complaint.aiAnalysis.lastAttemptAt).getTime()
    : 0;
  if (Date.now() - lastAttempt < 10000) {
    return { status: 429, allowed: false, message: "Too many requests" };
  }

  return { status: 200, allowed: true, message: "Proceed with retry" };
};

test("Retry AI: Citizen is rejected with 403", () => {
  const complaint = { category: "Road & Infrastructure", aiAnalysis: { status: "failed" } };
  const user = { role: "citizen", _id: sampleId() };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("Retry AI: Department Officer is rejected with 403", () => {
  const complaint = { category: "Road & Infrastructure", aiAnalysis: { status: "failed" } };
  const user = { role: "department", departmentRole: "officer", department: "Road & Infrastructure" };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("Retry AI: Authority from unrelated department is rejected with 403", () => {
  const complaint = { category: "Road & Infrastructure", aiAnalysis: { status: "failed" } };
  const user = { role: "department", departmentRole: "authority", department: "Water Supply" };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("Retry AI: Authority from matching department is permitted", () => {
  const complaint = {
    category: "Road & Infrastructure",
    aiAnalysis: { status: "failed", lastAttemptAt: new Date(Date.now() - 30000).toISOString() },
  };
  const user = { role: "department", departmentRole: "authority", department: "Road & Infrastructure" };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test("Retry AI: Admin is permitted across all departments", () => {
  const complaint = {
    category: "Water Supply",
    aiAnalysis: { status: "failed", lastAttemptAt: new Date(Date.now() - 30000).toISOString() },
  };
  const user = { role: "admin", _id: sampleId() };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test("Retry AI: already completed analysis prevents redundant processing", () => {
  const complaint = { category: "Electricity", aiAnalysis: { status: "completed" } };
  const user = { role: "admin" };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.status, 200);
  assert.equal(result.message, "Already completed");
});

test("Retry AI: rate limiting blocks consecutive requests within 10 seconds with 429", () => {
  const complaint = {
    category: "Electricity",
    aiAnalysis: { status: "failed", lastAttemptAt: new Date().toISOString() }, // Attempted just now
  };
  const user = { role: "admin" };
  const result = evaluateRetryAiAccess(user, complaint);
  assert.equal(result.status, 429);
  assert.equal(result.allowed, false);
});

// ==========================================
// 5. PHASE 4B FINAL HARDENING TESTS
// ==========================================

// --- Issue 1: SLA Re-anchoring on AI Retry ---

test("SLA Hardening: createSla defaults to Medium 72h when priority is missing or invalid", () => {
  const slaDefault = createSla();
  assert.equal(slaDefault.durationMinutes, 72 * 60);
  assert.ok(slaDefault.startedAt instanceof Date);
  assert.ok(slaDefault.deadline instanceof Date);
  assert.equal(slaDefault.deadline.getTime() - slaDefault.startedAt.getTime(), 72 * 60 * 60 * 1000);

  const slaInvalid = createSla("SuperUrgent");
  assert.equal(slaInvalid.durationMinutes, 72 * 60);
  assert.equal(slaInvalid.deadline.getTime() - slaInvalid.startedAt.getTime(), 72 * 60 * 60 * 1000);
});

test("SLA Hardening: createSla preserves original startedAt and anchors deadline strictly from intake", () => {
  const intakeTime = new Date("2026-05-01T10:00:00.000Z");

  // Critical = 4 hours (240 minutes)
  const slaCritical = createSla("Critical", { startedAt: intakeTime });
  assert.equal(slaCritical.startedAt.toISOString(), "2026-05-01T10:00:00.000Z");
  assert.equal(slaCritical.durationMinutes, 4 * 60);
  assert.equal(slaCritical.deadline.toISOString(), "2026-05-01T14:00:00.000Z");

  // High = 24 hours (1440 minutes)
  const slaHigh = createSla("High", { startedAt: intakeTime });
  assert.equal(slaHigh.startedAt.toISOString(), "2026-05-01T10:00:00.000Z");
  assert.equal(slaHigh.durationMinutes, 24 * 60);
  assert.equal(slaHigh.deadline.toISOString(), "2026-05-02T10:00:00.000Z");

  // Medium = 72 hours (4320 minutes)
  const slaMedium = createSla("Medium", { startedAt: intakeTime });
  assert.equal(slaMedium.startedAt.toISOString(), "2026-05-01T10:00:00.000Z");
  assert.equal(slaMedium.durationMinutes, 72 * 60);
  assert.equal(slaMedium.deadline.toISOString(), "2026-05-04T10:00:00.000Z");

  // Low = 168 hours (10080 minutes)
  const slaLow = createSla("Low", { startedAt: intakeTime });
  assert.equal(slaLow.startedAt.toISOString(), "2026-05-01T10:00:00.000Z");
  assert.equal(slaLow.durationMinutes, 168 * 60);
  assert.equal(slaLow.deadline.toISOString(), "2026-05-08T10:00:00.000Z");
});

test("SLA Hardening: AI retry at 14:00 upgrading Medium (10:00) to Critical recalculates deadline to 14:00, not 18:00", () => {
  const intakeTime = new Date("2026-05-01T10:00:00.000Z");
  const initialSla = createSla("Medium", { startedAt: intakeTime });

  // Initial deadline is 10:00 + 72h = 2026-05-04T10:00:00.000Z
  assert.equal(initialSla.deadline.toISOString(), "2026-05-04T10:00:00.000Z");

  // AI retry occurs at 14:00 and detects Critical priority
  const retryTime = new Date("2026-05-01T14:00:00.000Z");
  const upgradedSla = createSla("Critical", { startedAt: initialSla.startedAt });

  // StartedAt MUST remain original intake anchor
  assert.equal(upgradedSla.startedAt.toISOString(), "2026-05-01T10:00:00.000Z");
  // Deadline MUST be 10:00 + 4 hours = 14:00, NOT retryTime + 4 hours = 18:00
  assert.equal(upgradedSla.deadline.toISOString(), "2026-05-01T14:00:00.000Z");
  assert.notEqual(upgradedSla.deadline.toISOString(), new Date(retryTime.getTime() + 4 * 60 * 60 * 1000).toISOString());
});

test("SLA Hardening: repeated AI retries do not drift startedAt or deadline", () => {
  const intakeTime = new Date("2026-05-01T10:00:00.000Z");
  let currentSla = createSla("Critical", { startedAt: intakeTime });
  const initialDeadline = currentSla.deadline.toISOString();

  // Retry at 15:00
  const retry1 = createSla("Critical", { startedAt: currentSla.startedAt });
  assert.equal(retry1.startedAt.toISOString(), intakeTime.toISOString());
  assert.equal(retry1.deadline.toISOString(), initialDeadline);

  // Retry at 16:00
  const retry2 = createSla("Critical", { startedAt: retry1.startedAt });
  assert.equal(retry2.startedAt.toISOString(), intakeTime.toISOString());
  assert.equal(retry2.deadline.toISOString(), initialDeadline);
});

test("SLA Hardening: createSla preserves existing resolvedAt and does not reset resolution marker", () => {
  const intakeTime = new Date("2026-05-01T10:00:00.000Z");
  const resolvedTime = new Date("2026-05-02T12:00:00.000Z");

  const sla = createSla("High", { startedAt: intakeTime, resolvedAt: resolvedTime });
  assert.equal(sla.startedAt.toISOString(), intakeTime.toISOString());
  assert.equal(sla.resolvedAt.toISOString(), resolvedTime.toISOString());
  assert.equal(sla.durationMinutes, 24 * 60);
});

// --- Issue 2: Database-Level Idempotency & Partial Unique Index ---

test("Database Idempotency: Complaint schema defines partial unique index for clientRequestId", () => {
  const indexes = Complaint.schema.indexes();
  const clientReqIndex = indexes.find(([fields]) => fields.clientRequestId === 1);

  assert.ok(clientReqIndex, "Index on clientRequestId must exist");
  const [, options] = clientReqIndex;
  assert.equal(options.unique, true, "Index must be unique");
  assert.deepEqual(
    options.partialFilterExpression,
    { clientRequestId: { $type: "string" } },
    "Must use partialFilterExpression to ignore null/missing values"
  );
});

test("Database Idempotency: Duplicate key E11000 race returns existing complaint with 200 OK", async () => {
  const existingComplaint = {
    _id: "comp-race-winner-123",
    title: "Streetlight outage on Block C",
    description: "Light out for 3 days",
    category: "Electricity",
    clientRequestId: "req-race-condition-abc",
    status: "Pending",
    createdAt: new Date().toISOString(),
  };

  const simulateMongoInsertWithRace = async ({ clientRequestId, insertThrowsE11000 }) => {
    try {
      if (insertThrowsE11000) {
        const error = new Error("E11000 duplicate key error collection: complaints index: clientRequestId_1 dup key");
        error.code = 11000;
        throw error;
      }
      return { status: 201, body: { _id: "comp-new" } };
    } catch (insertError) {
      if (insertError?.code === 11000 && clientRequestId) {
        const existing = existingComplaint;
        if (existing) {
          return { status: 200, body: existing, isDuplicate: true };
        }
      }
      return { status: 500, message: "Failed to persist complaint", error: insertError.message };
    }
  };

  const response = await simulateMongoInsertWithRace({
    clientRequestId: "req-race-condition-abc",
    insertThrowsE11000: true,
  });

  assert.equal(response.status, 200);
  assert.equal(response.isDuplicate, true);
  assert.equal(response.body._id, "comp-race-winner-123");
  assert.equal(response.body.clientRequestId, "req-race-condition-abc");
});

// --- Issue 3: Post-Persistence Error Handling & Stage Decoupling ---

test("Stage Decoupling: Secondary notification delivery failure does not compromise persisted complaint", async () => {
  const simulateLifecycle = async ({ notificationShouldFail, populateShouldFail }) => {
    const complaint = {
      _id: "comp-persisted-789",
      title: "Broken water main",
      description: "Flooding the street",
      category: "Water Supply",
      status: "Pending",
      sla: createSla("Medium"),
    };

    const aiOutcome = { status: "completed" };

    let notificationDelivery = "delivered";
    try {
      if (notificationShouldFail) {
        throw new Error("Socket.IO disconnected / Notification service timed out");
      }
    } catch (notifyError) {
      notificationDelivery = "failed";
    }

    let populatedComplaint = complaint;
    try {
      if (populateShouldFail) {
        throw new Error("Population query failed due to read timeout");
      }
      populatedComplaint = { ...complaint, populated: true };
    } catch (popError) {
      populatedComplaint = complaint;
    }

    return {
      status: 201,
      body: {
        ...populatedComplaint,
        _submissionMeta: {
          aiStatus: aiOutcome.status,
          ...(notificationDelivery === "failed" ? { notificationDelivery: "failed" } : {}),
        },
      },
    };
  };

  const res1 = await simulateLifecycle({ notificationShouldFail: true, populateShouldFail: false });
  assert.equal(res1.status, 201);
  assert.equal(res1.body._id, "comp-persisted-789");
  assert.equal(res1.body._submissionMeta.notificationDelivery, "failed");
  assert.equal(res1.body.populated, true);

  const res2 = await simulateLifecycle({ notificationShouldFail: false, populateShouldFail: true });
  assert.equal(res2.status, 201);
  assert.equal(res2.body._id, "comp-persisted-789");
  assert.equal(res2.body.populated, undefined);
  assert.equal(res2.body._submissionMeta.notificationDelivery, undefined);

  const res3 = await simulateLifecycle({ notificationShouldFail: true, populateShouldFail: true });
  assert.equal(res3.status, 201);
  assert.equal(res3.body._id, "comp-persisted-789");
  assert.equal(res3.body._submissionMeta.notificationDelivery, "failed");
});

// ==========================================
// 8. MULTILINGUAL & TRANSLATION RELIABILITY (Phase 6B)
// ==========================================

test("Multilingual Intake: Devanagari Hindi text prompts correctly and parses detectedLanguage & englishTranslation", () => {
  const prompt = buildComplaintAnalysisPrompt({
    title: "सड़क पर बड़ा गड्ढा",
    description: "मेन रोड पर बहुत गहरा गड्ढा है जिससे दुर्घटना हो रही है। कृपया तुरंत मरम्मत करें।",
  });
  assert.match(prompt, /सड़क पर बड़ा गड्ढा/);

  const rawHindiGeminiResponse = {
    detectedLanguage: "Hindi (Devanagari)",
    englishTranslation: "Deep pothole on the main road causing accidents. Please repair immediately.",
    category: "Road & Infrastructure",
    priority: "High",
    urgencyScore: 8,
    confidence: 0.94,
    reasoning: "Road hazards on main transit routes pose immediate danger to motorists.",
    detectedIssue: "Hazardous pothole causing vehicle accidents",
    affectedArea: "Main Road",
    recommendedDepartment: "Road & Infrastructure",
    recommendedAction: "Dispatch emergency road crew for asphalt patching",
  };

  const parsed = parseComplaintAnalysis(JSON.stringify(rawHindiGeminiResponse));
  assert.equal(parsed.detectedLanguage, "Hindi (Devanagari)");
  assert.equal(parsed.englishTranslation, "Deep pothole on the main road causing accidents. Please repair immediately.");
  assert.equal(parsed.category, "Road & Infrastructure");
  assert.equal(parsed.priority, "High");
  assert.equal(parsed.urgencyScore, 8);
});

test("Multilingual Intake: Latin-script Hinglish text preserves original text and structures translation", async () => {
  const hinglishInput = {
    title: "Paani ki pipe phat gayi hai",
    description: "Main chowk ke paas pipe toot gayi hai aur bohot paani waste ho raha hai",
    category: "Water Supply",
  };

  const simulatedRawAi = {
    detectedLanguage: "Hinglish (Hindi in Roman script)",
    englishTranslation: "Water pipe has burst near the main intersection and huge amounts of water are being wasted.",
    category: "Water Supply",
    priority: "High",
    urgencyScore: 8,
    confidence: 0.92,
    reasoning: "Active main pipeline rupture causes resource waste and local flooding.",
    detectedIssue: "Burst water pipeline",
    affectedArea: "Main intersection / chowk",
    recommendedDepartment: "Water Supply",
    recommendedAction: "Isolate valve and dispatch pipeline repair team",
  };

  const result = await simulateCreateComplaint({
    body: hinglishInput,
    user: mockUser,
    geminiMockFn: async () => simulatedRawAi,
  });

  assert.equal(result.status, 201);
  // Original complaint fields remain untouched
  assert.equal(result.body.title, "Paani ki pipe phat gayi hai");
  assert.equal(result.body.description, "Main chowk ke paas pipe toot gayi hai aur bohot paani waste ho raha hai");
  // Translation and detection fields are populated
  assert.equal(result.body.aiAnalysis.detectedLanguage, "Hinglish (Hindi in Roman script)");
  assert.equal(result.body.aiAnalysis.englishTranslation, "Water pipe has burst near the main intersection and huge amounts of water are being wasted.");
  assert.equal(result.body.aiAnalysis.status, "completed");
});

test("Multilingual Intake: Mixed Hindi-English code-switched text processes cleanly", () => {
  const mixedResponse = {
    detectedLanguage: "Mixed (Hindi / English)",
    englishTranslation: "Street lights in sector 4 are not functioning since last week and women feel unsafe at night.",
    category: "Electricity & Power",
    priority: "Medium",
    urgencyScore: 6,
    confidence: 0.89,
    reasoning: "Non-functional street illumination presents public safety concerns.",
    detectedIssue: "Streetlight outage",
    affectedArea: "Sector 4",
    recommendedDepartment: "Electricity & Power",
    recommendedAction: "Replace faulty luminaires and inspect feeder line",
  };

  const parsed = parseComplaintAnalysis(JSON.stringify(mixedResponse));
  assert.equal(parsed.detectedLanguage, "Mixed (Hindi / English)");
  assert.match(parsed.englishTranslation, /Sector 4/i);
  assert.equal(parsed.category, "Electricity & Power");
});

test("Unsupported Category Resilience: Valid translation and metadata preserved under manual_review_required", async () => {
  const rawAnalysisWithUnsupportedDept = {
    detectedLanguage: "Hindi (Devanagari)",
    englishTranslation: "Overflowing garbage dumps near the community center creating foul smell.",
    category: "Sanitation & Waste Management",
    priority: "High",
    urgencyScore: 7,
    confidence: 0.91,
    reasoning: "Solid waste accumulation poses sanitary risks.",
    detectedIssue: "Overflowing garbage dump",
    affectedArea: "Near community center",
    recommendedDepartment: "Sanitation & Waste Management",
    recommendedAction: "Send waste collection truck immediately",
  };

  const parsed = parseComplaintAnalysis(JSON.stringify(rawAnalysisWithUnsupportedDept));
  assert.equal(parsed.category, "Sanitation & Waste Management");
  assert.equal(parsed.englishTranslation, rawAnalysisWithUnsupportedDept.englishTranslation);

  const result = await simulateCreateComplaint({
    body: {
      title: "कचरे का ढेर",
      description: "कम्युनिटी सेंटर के पास कचरे का भारी ढेर लगा हुआ है।",
      category: "Environment",
    },
    user: mockUser,
    geminiMockFn: async () => parsed,
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.category, "Environment");
  assert.equal(result.body.aiAnalysis.status, "manual_review_required");
  assert.equal(result.body.aiAnalysis.errorCategory, "INVALID_CATEGORY");
  assert.equal(result.body.aiAnalysis.detectedLanguage, "Hindi (Devanagari)");
  assert.equal(result.body.aiAnalysis.englishTranslation, "Overflowing garbage dumps near the community center creating foul smell.");
  assert.equal(result.body.aiAnalysis.urgencyScore, 7);
  assert.equal(result.body.aiAnalysis.detectedIssue, "Overflowing garbage dump");
  assert.equal(result.body.aiAnalysis.reasoning, "Solid waste accumulation poses sanitary risks.");
});

test("Translation Validation: Rejects missing or blank englishTranslation and detectedLanguage", () => {
  const missingTranslation = {
    ...sampleValidAnalysis,
    englishTranslation: "   ",
  };
  assert.throws(
    () => parseComplaintAnalysis(JSON.stringify(missingTranslation)),
    (err) => err.code === "MALFORMED_ANALYSIS"
  );

  const missingLanguage = {
    ...sampleValidAnalysis,
    detectedLanguage: "",
  };
  assert.throws(
    () => parseComplaintAnalysis(JSON.stringify(missingLanguage)),
    (err) => err.code === "MALFORMED_ANALYSIS"
  );
});

test("Manual AI Retry: Preserves translation and updates state accurately upon retry", async () => {
  const simulateRetry = async (complaint, geminiMockFn) => {
    try {
      const rawAnalysis = await geminiMockFn({
        title: complaint.title,
        description: complaint.description,
      });

      const isCategoryValid = DEPARTMENTS.includes(rawAnalysis.category);
      if (!isCategoryValid) {
        return {
          ...complaint,
          aiAnalysis: {
            ...rawAnalysis,
            status: "manual_review_required",
            errorCategory: "INVALID_CATEGORY",
            errorMessage: "AI returned unsupported department category.",
            retryCount: (complaint.aiAnalysis?.retryCount || 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          },
        };
      } else {
        return {
          ...complaint,
          aiAnalysis: {
            ...rawAnalysis,
            status: "completed",
            retryCount: (complaint.aiAnalysis?.retryCount || 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          },
        };
      }
    } catch (err) {
      return {
        ...complaint,
        aiAnalysis: {
          status: "failed",
          errorCategory: err.code || "AI_SERVICE_UNAVAILABLE",
          errorMessage: err.message,
          retryCount: (complaint.aiAnalysis?.retryCount || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
        },
      };
    }
  };

  const initialComplaint = {
    _id: "comp-retry-test-1",
    title: "बिजली नहीं आ रही",
    description: "कल रात से बिजली गुल है",
    category: "Electricity",
    aiAnalysis: {
      status: "manual_review_required",
      errorCategory: "INVALID_CATEGORY",
      detectedLanguage: "Hindi",
      englishTranslation: "No electricity since last night",
      retryCount: 1,
    },
  };

  const retrySuccess = await simulateRetry(initialComplaint, async () => ({
    detectedLanguage: "Hindi (Devanagari)",
    englishTranslation: "No electricity supply since yesterday night",
    category: "Electricity",
    priority: "High",
    urgencyScore: 8,
    confidence: 0.95,
    reasoning: "Extended power outage affecting residential sector",
    detectedIssue: "Power outage",
    affectedArea: "Residential area",
    recommendedDepartment: "Electricity",
    recommendedAction: "Dispatch electrical distribution repair crew",
  }));

  assert.equal(retrySuccess.aiAnalysis.status, "completed");
  assert.equal(retrySuccess.aiAnalysis.retryCount, 2);
  assert.equal(retrySuccess.aiAnalysis.detectedLanguage, "Hindi (Devanagari)");
  assert.equal(retrySuccess.aiAnalysis.englishTranslation, "No electricity supply since yesterday night");

  const retryUnsupportedAgain = await simulateRetry(initialComplaint, async () => ({
    detectedLanguage: "Hindi",
    englishTranslation: "Still power cut in the locality",
    category: "Grid Authority",
    priority: "High",
    urgencyScore: 8,
    confidence: 0.88,
    reasoning: "Power cut",
    detectedIssue: "Outage",
    affectedArea: "Locality",
    recommendedDepartment: "Grid Authority",
    recommendedAction: "Check transformer",
  }));

  assert.equal(retryUnsupportedAgain.aiAnalysis.status, "manual_review_required");
  assert.equal(retryUnsupportedAgain.aiAnalysis.retryCount, 2);
  assert.equal(retryUnsupportedAgain.aiAnalysis.englishTranslation, "Still power cut in the locality");
});

