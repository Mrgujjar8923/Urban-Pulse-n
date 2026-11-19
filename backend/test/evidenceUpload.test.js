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
import {
  detectImageSignature,
  uploadEvidenceFile,
  getEvidenceFile,
  deleteEvidenceFile,
  isSafeStorageKey,
} from "../src/services/evidenceStorage.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase7a-test-jwt-secret";
process.env.JWT_SECRET = JWT_SECRET;

const sampleId = () => new mongoose.Types.ObjectId().toString();

// Sample valid buffers
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
const sampleScriptBuffer = Buffer.from('#!/bin/bash\necho "Malicious script"');

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

// Isolated test storage setup
const testStorageDir = path.join(os.tmpdir(), `govai-evidence-test-${Date.now()}`);
process.env.EVIDENCE_UPLOAD_DIR = testStorageDir;

test.after(() => {
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
    const filename = file.filename || "upload.jpg";
    const contentType = file.contentType || "image/jpeg";
    const fieldName = file.fieldName || "image";
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
// 1–9: VALIDATION & STORAGE UNIT TESTS
// ==========================================

test("1. Valid JPEG: detects correct mimeType and extension", () => {
  const sig = detectImageSignature(sampleJpegBuffer);
  assert.ok(sig);
  assert.equal(sig.mimeType, "image/jpeg");
  assert.equal(sig.extension, ".jpg");
});

test("2. Valid PNG: detects correct mimeType and extension", () => {
  const sig = detectImageSignature(samplePngBuffer);
  assert.ok(sig);
  assert.equal(sig.mimeType, "image/png");
  assert.equal(sig.extension, ".png");
});

test("3. Valid WebP: detects correct mimeType and extension", () => {
  const sig = detectImageSignature(sampleWebpBuffer);
  assert.ok(sig);
  assert.equal(sig.mimeType, "image/webp");
  assert.equal(sig.extension, ".webp");
});

test("4. Invalid MIME / format (plain text): rejected", () => {
  const sig = detectImageSignature(sampleScriptBuffer);
  assert.equal(sig, null);
});

test("5. Spoofed MIME (text claiming to be jpeg): rejected by magic bytes", () => {
  const spoofedBuffer = Buffer.from("image/jpeg binary pretending to be text");
  const sig = detectImageSignature(spoofedBuffer);
  assert.equal(sig, null);
});

test("6. Invalid magic bytes: rejected", () => {
  const corruptBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
  assert.equal(detectImageSignature(corruptBuffer), null);
});

test("7. SVG rejection: SVG XML is strictly rejected", () => {
  assert.equal(detectImageSignature(sampleSvgBuffer), null);
});

test("8. Storage Service: saves file, retrieves buffer, and deletes safely", async () => {
  const uploadResult = await uploadEvidenceFile(samplePngBuffer, { originalname: "evidence.png" });
  assert.ok(uploadResult.storageKey.startsWith("complaints/"));
  assert.equal(uploadResult.mimeType, "image/png");

  // Retrieve
  const retrieved = await getEvidenceFile(uploadResult.storageKey);
  assert.ok(retrieved);
  assert.equal(retrieved.mimeType, "image/png");
  assert.deepEqual(retrieved.buffer, samplePngBuffer);

  // Delete
  const deleted = await deleteEvidenceFile(uploadResult.storageKey);
  assert.equal(deleted, true);

  // Verify gone
  const afterDelete = await getEvidenceFile(uploadResult.storageKey);
  assert.equal(afterDelete, null);
});

test("9. Path traversal protection: rejects malicious storage keys", async () => {
  assert.equal(isSafeStorageKey("../../etc/passwd"), false);
  assert.equal(isSafeStorageKey("complaints/../../../secret.txt"), false);
  assert.equal(isSafeStorageKey("/etc/shadow"), false);
  assert.equal(isSafeStorageKey("complaints/image\0.jpg"), false);
  assert.equal(await getEvidenceFile("../../etc/passwd"), null);
  assert.equal(await deleteEvidenceFile("../../etc/passwd"), false);
});

// ==========================================
// 10–13: HTTP MULTIPART UPLOAD ENDPOINT TESTS
// ==========================================

test("10. HTTP: JSON complaint submission without image continues working normally", async () => {
  const citizenId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const origFindById = User.findById;
  const origUserFind = User.find;
  const origFindOne = Complaint.findOne;
  const origFindByIdComp = Complaint.findById;
  const origCreate = Complaint.create;
  const origApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
      name: "Citizen Test",
    }),
  });

  User.find = () => ({
    select: () => ({
      lean: () => Promise.resolve([]),
    }),
  });

  Complaint.findOne = () => ({
    populate: () => Promise.resolve(null),
  });

  let createdDoc = null;
  Complaint.create = (doc) => {
    createdDoc = {
      _id: sampleId(),
      ...doc,
      createdAt: new Date(),
      timeline: doc.timeline || [],
      save: function () { return Promise.resolve(this); },
      populate: function () { return Promise.resolve(this); },
    };
    return Promise.resolve(createdDoc);
  };

  Complaint.findById = () => ({
    populate: () => Promise.resolve(createdDoc),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Leaking pipe near school",
          description: "Water is overflowing across the entire road",
          category: "Water Supply",
          location: "Sector 14",
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.title, "Leaking pipe near school");
      assert.equal(data.image, "");
    });
  } finally {
    User.findById = origFindById;
    User.find = origUserFind;
    Complaint.findOne = origFindOne;
    Complaint.findById = origFindByIdComp;
    Complaint.create = origCreate;
    if (origApiKey !== undefined) process.env.GEMINI_API_KEY = origApiKey;
  }
});

test("11. HTTP: Multipart complaint submission with valid JPEG saves image and stores storageKey", async () => {
  const citizenId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const origFindById = User.findById;
  const origUserFind = User.find;
  const origFindOne = Complaint.findOne;
  const origFindByIdComp = Complaint.findById;
  const origCreate = Complaint.create;
  const origApiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
      name: "Citizen Test",
    }),
  });

  User.find = () => ({
    select: () => ({
      lean: () => Promise.resolve([]),
    }),
  });

  Complaint.findOne = () => ({
    populate: () => Promise.resolve(null),
  });

  let createdComplaintDoc = null;
  Complaint.create = (doc) => {
    createdComplaintDoc = {
      _id: sampleId(),
      ...doc,
      createdAt: new Date(),
      timeline: doc.timeline || [],
      save: function () { return Promise.resolve(this); },
      populate: function () { return Promise.resolve(this); },
    };
    return Promise.resolve(createdComplaintDoc);
  };

  Complaint.findById = () => ({
    populate: () => Promise.resolve(createdComplaintDoc),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = `----TestBoundary${Date.now()}`;
      const body = createMultipartBody(
        boundary,
        {
          title: "Damaged electric pole",
          description: "High tension line hanging dangerously low",
          category: "Electricity",
          location: "Sector 22",
        },
        {
          fieldName: "image",
          filename: "pole_damage.jpg",
          contentType: "image/jpeg",
          buffer: sampleJpegBuffer,
        }
      );

      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 201);
      assert.ok(createdComplaintDoc);
      assert.ok(createdComplaintDoc.image.startsWith("complaints/"));
      assert.ok(createdComplaintDoc.image.endsWith(".jpg"));

      // Clean up saved file
      await deleteEvidenceFile(createdComplaintDoc.image);
    });
  } finally {
    User.findById = origFindById;
    User.find = origUserFind;
    Complaint.findOne = origFindOne;
    Complaint.findById = origFindByIdComp;
    Complaint.create = origCreate;
    if (origApiKey !== undefined) process.env.GEMINI_API_KEY = origApiKey;
  }
});

test("12. HTTP: Uploading file larger than 5 MB returns HTTP 413", async () => {
  const citizenId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
      name: "Citizen Test",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = `----LargeFileBoundary${Date.now()}`;
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024); // 5MB + 1KB
      // Set valid JPEG header at start
      sampleJpegBuffer.copy(largeBuffer, 0, 0, sampleJpegBuffer.length);

      const body = createMultipartBody(
        boundary,
        {
          title: "Large upload test",
          description: "Testing size limit enforcement",
          category: "Electricity",
        },
        {
          fieldName: "image",
          filename: "large.jpg",
          contentType: "image/jpeg",
          buffer: largeBuffer,
        }
      );

      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 413);
      const data = await res.json();
      assert.match(data.message, /5 MB/i);
    });
  } finally {
    User.findById = origFindById;
  }
});

test("13. HTTP: Uploading multiple files or unexpected field returns HTTP 400", async () => {
  const citizenId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
      name: "Citizen Test",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = `----MultiFileBoundary${Date.now()}`;
      const body = createMultipartBody(
        boundary,
        {
          title: "Unexpected field upload",
          description: "Testing field count",
          category: "Electricity",
        },
        {
          fieldName: "unexpected_avatar",
          filename: "extra.jpg",
          contentType: "image/jpeg",
          buffer: sampleJpegBuffer,
        }
      );

      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 400);
    });
  } finally {
    User.findById = origFindById;
  }
});

test("14. HTTP: Uploading spoofed file with fake extension returns HTTP 400", async () => {
  const citizenId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  const origFindById = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
      name: "Citizen Test",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const boundary = `----SpoofBoundary${Date.now()}`;
      const body = createMultipartBody(
        boundary,
        {
          title: "Spoofed file test",
          description: "Fake JPEG extension containing bash script",
          category: "Road & Infrastructure",
        },
        {
          fieldName: "image",
          filename: "exploit.jpg",
          contentType: "image/jpeg",
          buffer: sampleScriptBuffer,
        }
      );

      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Invalid file type/i);
    });
  } finally {
    User.findById = origFindById;
  }
});

// ==========================================
// 15–20: EVIDENCE RETRIEVAL RBAC & INTEGRITY TESTS
// ==========================================

test("15. Evidence Retrieval: Citizen owner can retrieve their complaint evidence image", async () => {
  const citizenId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: citizenId, role: "citizen" });

  // Upload an evidence file first
  const { storageKey } = await uploadEvidenceFile(sampleJpegBuffer, { originalname: "road.jpg" });

  const origFindByIdUser = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: citizenId,
      role: "citizen",
      status: "active",
      name: "Owner Citizen",
    }),
  });

  const origFindByIdComplaint = Complaint.findById;
  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Road & Infrastructure",
      createdBy: { _id: citizenId },
      image: storageKey,
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/jpeg");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      const buffer = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(buffer, sampleJpegBuffer);
    });
  } finally {
    User.findById = origFindByIdUser;
    Complaint.findById = origFindByIdComplaint;
    await deleteEvidenceFile(storageKey);
  }
});

test("16. Evidence Retrieval: Unrelated citizen is rejected with HTTP 403 Forbidden", async () => {
  const citizenOwnerId = sampleId();
  const snooperCitizenId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: snooperCitizenId, role: "citizen" });

  const { storageKey } = await uploadEvidenceFile(samplePngBuffer, { originalname: "secret.png" });

  const origFindByIdUser = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: snooperCitizenId,
      role: "citizen",
      status: "active",
      name: "Snooper Citizen",
    }),
  });

  const origFindByIdComplaint = Complaint.findById;
  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Water Supply",
      createdBy: { _id: citizenOwnerId }, // Different owner!
      image: storageKey,
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 403);
    });
  } finally {
    User.findById = origFindByIdUser;
    Complaint.findById = origFindByIdComplaint;
    await deleteEvidenceFile(storageKey);
  }
});

test("17. Evidence Retrieval: Department Authority in matching department can access evidence", async () => {
  const authorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: authorityId, role: "department" });

  const { storageKey } = await uploadEvidenceFile(sampleWebpBuffer, { originalname: "wire.webp" });

  const origFindByIdUser = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: authorityId,
      role: "department",
      department: "Electricity",
      departmentRole: "authority",
      status: "active",
      name: "Electricity Authority",
    }),
  });

  const origFindByIdComplaint = Complaint.findById;
  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Electricity", // Matching department!
      createdBy: { _id: sampleId() },
      image: storageKey,
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/webp");
    });
  } finally {
    User.findById = origFindByIdUser;
    Complaint.findById = origFindByIdComplaint;
    await deleteEvidenceFile(storageKey);
  }
});

test("18. Evidence Retrieval: Cross-department authority is rejected with HTTP 403", async () => {
  const waterAuthorityId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: waterAuthorityId, role: "department" });

  const { storageKey } = await uploadEvidenceFile(sampleJpegBuffer, { originalname: "road.jpg" });

  const origFindByIdUser = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: waterAuthorityId,
      role: "department",
      department: "Water Supply", // Water authority trying to view Road complaint!
      departmentRole: "authority",
      status: "active",
      name: "Water Authority",
    }),
  });

  const origFindByIdComplaint = Complaint.findById;
  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Road & Infrastructure",
      createdBy: { _id: sampleId() },
      image: storageKey,
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 403);
    });
  } finally {
    User.findById = origFindByIdUser;
    Complaint.findById = origFindByIdComplaint;
    await deleteEvidenceFile(storageKey);
  }
});

test("19. Evidence Retrieval: Admin can access evidence across any department", async () => {
  const adminId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: adminId, role: "admin" });

  const { storageKey } = await uploadEvidenceFile(samplePngBuffer, { originalname: "admin_view.png" });

  const origFindByIdUser = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: adminId,
      role: "admin",
      status: "active",
      name: "Super Admin",
    }),
  });

  const origFindByIdComplaint = Complaint.findById;
  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Environment",
      createdBy: { _id: sampleId() },
      image: storageKey,
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "image/png");
    });
  } finally {
    User.findById = origFindByIdUser;
    Complaint.findById = origFindByIdComplaint;
    await deleteEvidenceFile(storageKey);
  }
});

test("20. Evidence Retrieval: Missing evidence or legacy 'uploaded' placeholder returns HTTP 404", async () => {
  const adminId = sampleId();
  const complaintId = sampleId();
  const token = createAuthToken({ id: adminId, role: "admin" });

  const origFindByIdUser = User.findById;
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: adminId,
      role: "admin",
      status: "active",
      name: "Super Admin",
    }),
  });

  const origFindByIdComplaint = Complaint.findById;
  // Case A: image is "uploaded" placeholder
  Complaint.findById = () => ({
    populate: () => Promise.resolve({
      _id: complaintId,
      category: "Environment",
      createdBy: { _id: sampleId() },
      image: "uploaded",
    }),
  });

  try {
    await withRunningServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.match(data.message, /No evidence image/i);
    });
  } finally {
    User.findById = origFindByIdUser;
    Complaint.findById = origFindByIdComplaint;
  }
});
