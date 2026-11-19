import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import http from "node:http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../src/app.js";
import { Complaint } from "../src/models/Complaint.js";
import { User } from "../src/models/User.js";
import { Member } from "../src/models/Member.js";
import { Feedback } from "../src/models/Feedback.js";
import {
  uploadEvidenceFile,
  getEvidenceFile,
  deleteEvidenceFile,
} from "../src/services/evidenceStorage.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase7b-test-jwt-secret";
process.env.JWT_SECRET = JWT_SECRET;

const sampleId = () => new mongoose.Types.ObjectId().toString();

// Valid test image signatures
const sampleJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9,
]);

const samplePngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
]);

const sampleWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00,
]);

const sampleSvgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const createAuthToken = (userPayload) => {
  return jwt.sign(userPayload, JWT_SECRET, { expiresIn: "1h" });
};

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

// Isolated test storage directory
const testStorageDir = path.join(os.tmpdir(), `govai-resolution-test-${Date.now()}`);
process.env.EVIDENCE_UPLOAD_DIR = testStorageDir;

// Provide non-blocking default stubs for secondary queries (e.g. notifications / member lookups)
const origGlobalMemberFindOne = Member.findOne;
const origGlobalUserFind = User.find;
const origGlobalUserFindOne = User.findOne;

Member.findOne = () => ({
  select: () => ({
    lean: () => Promise.resolve(null),
  }),
});
User.find = () => ({
  select: () => ({
    lean: () => Promise.resolve([]),
  }),
});
User.findOne = () => ({
  select: () => ({
    lean: () => Promise.resolve(null),
  }),
});

test.after(() => {
  Member.findOne = origGlobalMemberFindOne;
  User.find = origGlobalUserFind;
  User.findOne = origGlobalUserFindOne;
  try {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup error
  }
});

// Helper to create multipart form body in memory
const createMultipartBody = (boundary, fields = {}, file = null) => {
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }

  if (file) {
    const filename = file.filename || "resolution.jpg";
    const contentType = file.contentType || "image/jpeg";
    const fieldName = file.fieldName || "evidence";
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
};

// ==========================================
// 1. SCHEMA UNIT TESTS
// ==========================================

test("1. Schema: Complaint resolutionHistory schema validates remarks and constraints", () => {
  const comp = new Complaint({
    title: "Water pipeline leak",
    description: "Major water leak on Main St",
    category: "Water",
    createdBy: sampleId(),
    resolutionHistory: [
      {
        remarks: "Replaced faulty joint valve and inspected pressure.",
        evidence: "complaints/test-uuid.jpg",
        resolvedAt: new Date(),
        resolvedBy: new mongoose.Types.ObjectId(),
      },
    ],
  });

  const entry = comp.resolutionHistory[0];
  assert.equal(entry.remarks, "Replaced faulty joint valve and inspected pressure.");
  assert.equal(entry.evidence, "complaints/test-uuid.jpg");
  assert.ok(entry.resolvedAt instanceof Date);
  assert.ok(entry._id instanceof mongoose.Types.ObjectId);
});

test("2. Schema: Feedback history and resolutionId schema fields validate properly", () => {
  const fb = new Feedback({
    complaintId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    rating: 5,
    comment: "Excellent repair work",
    workCompleted: true,
    percentDone: 100,
    resolutionId: new mongoose.Types.ObjectId(),
    history: [
      {
        rating: 2,
        comment: "Initial attempt incomplete",
        workCompleted: false,
        percentDone: 40,
        resolutionId: new mongoose.Types.ObjectId(),
        submittedAt: new Date(),
      },
    ],
  });

  assert.equal(fb.rating, 5);
  assert.equal(fb.history.length, 1);
  assert.equal(fb.history[0].rating, 2);
  assert.ok(fb.history[0].resolutionId instanceof mongoose.Types.ObjectId);
});

// ==========================================
// 2. RESOLUTION REMARKS VALIDATION (HTTP)
// ==========================================

test("3. HTTP: PUT /api/complaints/:id/status rejects status='Resolved' without remarks with 400", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
      name: "Water Authority",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    save: async () => {},
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved" }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Resolution remarks are required/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("4. HTTP: PUT /api/complaints/:id/status rejects status='Resolved' with whitespace-only remarks with 400", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    save: async () => {},
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "     " }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Resolution remarks are required/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("5. HTTP: PUT /api/complaints/:id/status rejects status='Resolved' with remarks exceeding 2000 chars with 400", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    save: async () => {},
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const longRemarks = "a".repeat(2001);
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: longRemarks }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /cannot exceed 2000 characters/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("6. HTTP: PUT /api/complaints/:id/status accepts status='Resolved' with valid JSON remarks (200)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date(), durationMinutes: 1440, deadline: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "Resolved",
          remarks: "Repaired broken pipe connection and verified zero leakage.",
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "Resolved");
      assert.equal(savedDoc.resolutionHistory.length, 1);
      assert.equal(savedDoc.resolutionHistory[0].remarks, "Repaired broken pipe connection and verified zero leakage.");
      assert.ok(savedDoc.sla.resolvedAt instanceof Date);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 3. MULTIPART RESOLUTION & EVIDENCE FORMATS
// ==========================================

test("7. HTTP: PUT /api/complaints/:id/status accepts multipart resolution with valid JPEG evidence file (200)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = "----WebKitFormBoundaryJpegResolve";
      const body = createMultipartBody(
        boundary,
        { status: "Resolved", remarks: "Repaired valve with evidence" },
        { filename: "valve.jpg", contentType: "image/jpeg", fieldName: "evidence", buffer: sampleJpegBuffer }
      );

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "Resolved");
      assert.equal(savedDoc.resolutionHistory.length, 1);
      assert.ok(savedDoc.resolutionHistory[0].evidence.startsWith("complaints/"));
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("8. HTTP: PUT /api/complaints/:id/status accepts multipart resolution with valid PNG evidence file (200)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = "----WebKitFormBoundaryPngResolve";
      const body = createMultipartBody(
        boundary,
        { status: "Resolved", remarks: "Completed repair with PNG evidence" },
        { filename: "repair.png", contentType: "image/png", fieldName: "evidence", buffer: samplePngBuffer }
      );

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "Resolved");
      assert.ok(savedDoc.resolutionHistory[0].evidence.endsWith(".png"));
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("9. HTTP: PUT /api/complaints/:id/status accepts multipart resolution with valid WebP evidence file (200)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = "----WebKitFormBoundaryWebpResolve";
      const body = createMultipartBody(
        boundary,
        { status: "Resolved", remarks: "Completed repair with WebP evidence" },
        { filename: "repair.webp", contentType: "image/webp", fieldName: "evidence", buffer: sampleWebpBuffer }
      );

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "Resolved");
      assert.ok(savedDoc.resolutionHistory[0].evidence.endsWith(".webp"));
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("10. HTTP: PUT /api/complaints/:id/status rejects resolution with invalid/executable file (400)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = "----WebKitFormBoundarySvgResolve";
      const body = createMultipartBody(
        boundary,
        { status: "Resolved", remarks: "Attempted SVG upload" },
        { filename: "malicious.svg", contentType: "image/svg+xml", fieldName: "evidence", buffer: sampleSvgBuffer }
      );

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Only JPEG, PNG, and WebP/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("11. HTTP: PUT /api/complaints/:id/status rejects resolution with evidence file exceeding 5MB (413)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = "----WebKitFormBoundaryOversized";
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 100);
      oversizedBuffer[0] = 0xff;
      oversizedBuffer[1] = 0xd8;
      oversizedBuffer[2] = 0xff;

      const body = createMultipartBody(
        boundary,
        { status: "Resolved", remarks: "Attempted oversized evidence" },
        { filename: "huge.jpg", contentType: "image/jpeg", fieldName: "evidence", buffer: oversizedBuffer }
      );

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 413);
      const data = await res.json();
      assert.match(data.message, /File size exceeds.*5\s*MB/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 4. DATA & SLA INTEGRITY
// ==========================================

test("12. Data Integrity: Resolution stores authenticated user in resolvedBy and sets resolvedAt timestamp", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Detailed resolution log" }),
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.resolutionHistory[0].resolvedBy.toString(), authorityId);
      assert.ok(savedDoc.resolutionHistory[0].resolvedAt instanceof Date);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("13. SLA Integrity: Resolution updates sla.resolvedAt to match resolution time", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date(), resolvedAt: undefined },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Fix verified" }),
      });

      assert.equal(res.status, 200);
      assert.ok(savedDoc.sla.resolvedAt instanceof Date);
      assert.equal(savedDoc.sla.resolvedAt.getTime(), savedDoc.resolutionHistory[0].resolvedAt.getTime());
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("14. Compatibility: Non-resolution status changes (e.g. In Progress) succeed with JSON and no remarks", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "Assigned",
    category: "Water",
    assignedTo: sampleId(),
    timeline: [],
    resolutionHistory: [],
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "In Progress" }),
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "In Progress");
      assert.equal(savedDoc.resolutionHistory.length, 0);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 5. RBAC PERMISSIONS FOR RESOLUTION
// ==========================================

test("15. RBAC: Citizen role cannot resolve complaints (403)", async () => {
  const citizenId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    createdBy: citizenId,
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Citizen attempting resolve" }),
      });

      assert.equal(res.status, 403);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("16. RBAC: Officer from same department but not assigned cannot resolve complaint (403)", async () => {
  const officerUserId = sampleId();
  const complaintId = sampleId();
  const otherMemberId = sampleId();
  const officerMemberId = sampleId();
  const token = createAuthToken({ id: officerUserId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;
  const origMemberFindOne = Member.findOne;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: officerUserId,
      role: "department",
      department: "Water",
      departmentRole: "officer",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    assignedTo: otherMemberId, // Assigned to someone else
  });

  Member.findOne = () => ({
    select: () => ({
      lean: () => Promise.resolve({ _id: officerMemberId, userId: officerUserId, department: "Water" }),
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Unassigned officer attempt" }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /Forbidden/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("17. RBAC: Assigned department officer can resolve the complaint (200)", async () => {
  const officerUserId = sampleId();
  const complaintId = sampleId();
  const officerMemberId = sampleId();
  const token = createAuthToken({ id: officerUserId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    assignedTo: officerMemberId,
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;
  const origMemberFindOne = Member.findOne;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: officerUserId,
      role: "department",
      department: "Water",
      departmentRole: "officer",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  Member.findOne = () => ({
    select: () => ({
      lean: () => Promise.resolve({ _id: officerMemberId, userId: officerUserId, department: "Water" }),
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Resolved by assigned officer" }),
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "Resolved");
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("18. RBAC: Authority can resolve complaint in their department (200)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "In Progress",
    category: "Roads",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Roads",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Pothole filled and tarmac settled" }),
      });

      assert.equal(res.status, 200);
      assert.equal(savedDoc.status, "Resolved");
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

test("19. RBAC: Authority in another department cannot resolve complaint (403)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water", // Water authority
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Roads", // Roads complaint
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Cross-dept attempt" }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /Forbidden/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 6. RESOLUTION EVIDENCE ACCESS & RBAC
// ==========================================

test("20. Evidence RBAC: Citizen owner can retrieve resolution evidence (200)", async () => {
  const citizenId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  // Store evidence file in isolated test storage
  const stored = await uploadEvidenceFile(sampleJpegBuffer, {
    originalname: "resolved.jpg",
    context: "resolution",
    complaintId,
  });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Water",
      createdBy: { _id: citizenId },
      resolutionHistory: [{ _id: sampleId(), evidence: stored.storageKey, remarks: "Fixed" }],
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/jpeg");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
    await deleteEvidenceFile(stored.storageKey);
  }
});

test("21. Evidence RBAC: Same-department authority and assigned officer can retrieve resolution evidence (200)", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const stored = await uploadEvidenceFile(samplePngBuffer, {
    originalname: "proof.png",
    context: "resolution",
    complaintId,
  });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Water",
      createdBy: { _id: sampleId() },
      resolutionHistory: [{ _id: sampleId(), evidence: stored.storageKey, remarks: "Fixed" }],
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/png");
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
    await deleteEvidenceFile(stored.storageKey);
  }
});

test("22. Evidence RBAC: Cross-department authority and unrelated citizen are denied resolution evidence (403)", async () => {
  const unrelatedCitizenId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: unrelatedCitizenId, role: "citizen" });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: unrelatedCitizenId,
      role: "citizen",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Water",
      createdBy: { _id: sampleId() }, // Different citizen
      resolutionHistory: [{ _id: sampleId(), evidence: "complaints/fake.jpg", remarks: "Fixed" }],
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 403);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 7. STORAGE CLEANUP & ROLLBACK ON FAILURE
// ==========================================

test("23. Storage Cleanup: Database failure during resolve rolls back newly uploaded evidence file", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  let capturedStorageKey = null;

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    timeline: [],
    resolutionHistory: [],
    sla: { startedAt: new Date() },
    save: async function () {
      // Capture evidence key added to resolutionHistory
      if (this.resolutionHistory?.[0]?.evidence) {
        capturedStorageKey = this.resolutionHistory[0].evidence;
      }
      throw new Error("Simulated database write error during resolve");
    },
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = "----WebKitFormBoundaryRollbackTest";
      const body = createMultipartBody(
        boundary,
        { status: "Resolved", remarks: "Will fail during save" },
        { filename: "fail.jpg", contentType: "image/jpeg", fieldName: "evidence", buffer: sampleJpegBuffer }
      );

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 500);

      // Verify that the uploaded file was cleaned up and does not remain on disk
      assert.ok(capturedStorageKey);
      const remainingFile = await getEvidenceFile(capturedStorageKey);
      assert.equal(remainingFile, null, "File must be deleted after DB failure rollback");
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 8. REOPENING & RE-RESOLUTION WORKFLOW
// ==========================================

test("24. Reopen & Re-resolve: Reopening preserves resolutionHistory and clears sla.resolvedAt; re-resolving appends new entry", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const firstResolutionDate = new Date("2026-11-08T10:00:00.000Z");
  const firstResolutionEntry = {
    _id: sampleId(),
    remarks: "First resolution attempt",
    evidence: "complaints/first.jpg",
    resolvedAt: firstResolutionDate,
    resolvedBy: authorityId,
  };

  let savedDoc = null;
  const mockDoc = {
    _id: complaintId,
    status: "Resolved",
    category: "Water",
    assignedTo: sampleId(),
    timeline: [],
    resolutionHistory: [firstResolutionEntry],
    sla: { startedAt: new Date(), resolvedAt: firstResolutionDate },
    save: async function () {
      savedDoc = this;
    },
    populate: function () {
      return Promise.resolve(this);
    },
  };

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Water",
      departmentRole: "authority",
      status: "active",
    }),
  });

  Complaint.findById = () => mockDoc;

  try {
    await withRunningServer(async (baseUrl) => {
      // Step A: Reopen complaint
      const reopenRes = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "In Progress" }),
      });

      assert.equal(reopenRes.status, 200);
      assert.equal(savedDoc.status, "In Progress");
      assert.equal(savedDoc.sla.resolvedAt, undefined, "sla.resolvedAt must be cleared on reopen");
      assert.equal(savedDoc.resolutionHistory.length, 1, "Prior resolution history must be preserved");

      // Step B: Re-resolve complaint
      const reResolveRes = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "Resolved", remarks: "Second resolution: replaced damaged gasket" }),
      });

      assert.equal(reResolveRes.status, 200);
      assert.equal(savedDoc.status, "Resolved");
      assert.equal(savedDoc.resolutionHistory.length, 2, "Second resolution must be appended");
      assert.equal(savedDoc.resolutionHistory[0].remarks, "First resolution attempt");
      assert.equal(savedDoc.resolutionHistory[1].remarks, "Second resolution: replaced damaged gasket");
      assert.ok(savedDoc.sla.resolvedAt instanceof Date);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
  }
});

// ==========================================
// 9. MULTI-EVIDENCE & CITIZEN FEEDBACK LIFECYCLE
// ==========================================

test("25. Multi-evidence & Feedback Lifecycle: Historical evidence accessible via entryId; citizen can submit fresh feedback after re-resolution without duplicate collision", async () => {
  const citizenId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const firstEntryId = sampleId();
  const secondEntryId = sampleId();

  const file1 = await uploadEvidenceFile(sampleJpegBuffer, { originalname: "first.jpg", complaintId });
  const file2 = await uploadEvidenceFile(samplePngBuffer, { originalname: "second.png", complaintId });

  const origUserFindById = User.findById;
  const origComplaintFindById = Complaint.findById;
  const origFeedbackFindOne = Feedback.findOne;
  const origFeedbackCreate = Feedback.create;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
    }),
  });

  Complaint.findById = () => ({
    _id: complaintId,
    category: "Water",
    createdBy: { _id: citizenId },
    status: "Resolved",
    resolutionHistory: [
      { _id: firstEntryId, evidence: file1.storageKey, remarks: "First fix" },
      { _id: secondEntryId, evidence: file2.storageKey, remarks: "Second fix" },
    ],
    save: async () => {},
    populate: function () { return Promise.resolve(this); },
  });

  let existingFeedbackDoc = null;

  Feedback.findOne = () => Promise.resolve(existingFeedbackDoc);
  Feedback.create = (doc) => {
    existingFeedbackDoc = {
      _id: sampleId(),
      ...doc,
      history: [],
      save: async function () { return this; },
    };
    return Promise.resolve(existingFeedbackDoc);
  };

  try {
    await withRunningServer(async (baseUrl) => {
      // A. Query first historical resolution evidence via entryId
      const evidenceRes = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${firstEntryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(evidenceRes.status, 200);
      assert.equal(evidenceRes.headers.get("content-type"), "image/jpeg");

      // B. Query latest resolution evidence without entryId (should return second file - PNG)
      const latestEvidenceRes = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(latestEvidenceRes.status, 200);
      assert.equal(latestEvidenceRes.headers.get("content-type"), "image/png");

      // C. Submit feedback for the first resolution attempt
      const fb1 = await fetch(`${baseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          complaintId,
          rating: 4,
          comment: "Good initial effort",
          workCompleted: true,
          percentDone: 90,
        }),
      });
      assert.equal(fb1.status, 201);
      assert.equal(existingFeedbackDoc.rating, 4);
      assert.equal(existingFeedbackDoc.resolutionId.toString(), secondEntryId);

      // D. Duplicate feedback for the exact same resolution attempt must be rejected (400)
      const duplicateFb = await fetch(`${baseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          complaintId,
          rating: 5,
          comment: "Trying to submit duplicate",
          workCompleted: true,
          percentDone: 100,
        }),
      });
      assert.equal(duplicateFb.status, 400);
      const dupData = await duplicateFb.json();
      assert.match(dupData.message, /Feedback has already been submitted for this resolution attempt/i);
    });
  } finally {
    User.findById = origUserFindById;
    Complaint.findById = origComplaintFindById;
    Feedback.findOne = origFeedbackFindOne;
    Feedback.create = origFeedbackCreate;
    await deleteEvidenceFile(file1.storageKey);
    await deleteEvidenceFile(file2.storageKey);
  }
});
