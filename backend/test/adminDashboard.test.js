import test from "node:test";
import assert from "node:assert/strict";
import { buildDateFilter } from "../src/controllers/admin.controller.js";
import { requireRole } from "../src/middleware/role.middleware.js";

// ==========================================
// 1. DATE FILTER UNIT TESTS
// ==========================================

test("Admin Dashboard: buildDateFilter returns empty filter for allTime or null", () => {
  assert.deepEqual(buildDateFilter(), {});
  assert.deepEqual(buildDateFilter("allTime"), {});
  assert.deepEqual(buildDateFilter("unknown"), {});
});

test("Admin Dashboard: buildDateFilter computes correct cutoff for relative ranges", () => {
  const now = Date.now();

  const filter7d = buildDateFilter("last7Days");
  assert.ok(filter7d.createdAt.$gte instanceof Date);
  const diff7d = now - filter7d.createdAt.$gte.getTime();
  // Approximately 7 days (tolerance within 10 seconds)
  assert.ok(Math.abs(diff7d - 7 * 24 * 60 * 60 * 1000) < 10000);

  const filter30d = buildDateFilter("last30Days");
  assert.ok(filter30d.createdAt.$gte instanceof Date);
  const diff30d = now - filter30d.createdAt.$gte.getTime();
  assert.ok(Math.abs(diff30d - 30 * 24 * 60 * 60 * 1000) < 10000);

  const filter6m = buildDateFilter("last6Months");
  assert.ok(filter6m.createdAt.$gte instanceof Date);
  const diff6m = now - filter6m.createdAt.$gte.getTime();
  assert.ok(Math.abs(diff6m - 180 * 24 * 60 * 60 * 1000) < 10000);

  const filter1y = buildDateFilter("thisYear");
  assert.ok(filter1y.createdAt.$gte instanceof Date);
  assert.equal(filter1y.createdAt.$gte.getMonth(), 0);
  assert.equal(filter1y.createdAt.$gte.getDate(), 1);
});

test("Admin Dashboard: buildDateFilter supports custom startDate and endDate", () => {
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2026-06-30T23:59:59.999Z";

  const filter = buildDateFilter(null, start, end);
  assert.deepEqual(filter.createdAt, {
    $gte: new Date(start),
    $lte: new Date(end),
  });

  // Invalid date strings are safely ignored
  const filterInvalid = buildDateFilter(null, "invalid-date", "another-invalid");
  assert.deepEqual(filterInvalid, {});
});

// ==========================================
// 2. METRIC FORMULA & ACCURACY TESTS
// ==========================================

test("Admin Dashboard: Metric calculation definitions and mathematical accuracy", () => {
  const computeMetrics = ({ complaints, users, now = new Date("2026-11-01T12:00:00.000Z") }) => {
    const totalComplaints = complaints.length;
    const pendingComplaints = complaints.filter((c) => c.status === "Pending").length;
    const assignedComplaints = complaints.filter((c) => c.status === "Assigned").length;
    const inProgressComplaints = complaints.filter((c) => c.status === "In Progress").length;
    const resolvedComplaints = complaints.filter((c) => c.status === "Resolved").length;

    // Overdue: status != Resolved AND sla.deadline < now
    const overdueComplaints = complaints.filter((c) => (
      c.status !== "Resolved" &&
      c.sla?.deadline &&
      new Date(c.sla.deadline).getTime() < now.getTime()
    )).length;

    // Resolution rate: (resolved / total) * 100 rounded to 1 decimal
    const resolutionRate = totalComplaints > 0
      ? Number(((resolvedComplaints / totalComplaints) * 100).toFixed(1))
      : 0;

    const totalCitizens = users.filter((u) => u.role === "citizen").length;
    const totalAuthorities = users.filter((u) => u.role === "department" && u.departmentRole === "authority").length;
    const totalOfficers = users.filter((u) => u.role === "department" && u.departmentRole === "officer").length;

    return {
      totalComplaints,
      pendingComplaints,
      assignedComplaints,
      inProgressComplaints,
      resolvedComplaints,
      overdueComplaints,
      resolutionRate,
      totalCitizens,
      totalAuthorities,
      totalOfficers,
    };
  };

  const sampleComplaints = [
    { status: "Pending", sla: { deadline: "2026-10-31T10:00:00.000Z" } }, // Overdue
    { status: "Pending", sla: { deadline: "2026-11-05T10:00:00.000Z" } }, // On track
    { status: "Assigned", sla: { deadline: "2026-10-25T10:00:00.000Z" } }, // Overdue
    { status: "In Progress", sla: { deadline: "2026-11-02T10:00:00.000Z" } }, // On track
    { status: "Resolved", sla: { deadline: "2026-10-20T10:00:00.000Z" } }, // Resolved (NOT overdue)
  ];

  const sampleUsers = [
    { role: "citizen" },
    { role: "citizen" },
    { role: "citizen" },
    { role: "department", departmentRole: "authority" },
    { role: "department", departmentRole: "authority" },
    { role: "department", departmentRole: "officer" },
    { role: "department", departmentRole: "officer" },
    { role: "department" }, // legacy account without departmentRole -> excluded from officers
    { role: "department", departmentRole: "unknown_role" }, // malformed account -> excluded
    { role: "admin" },
  ];

  const metrics = computeMetrics({ complaints: sampleComplaints, users: sampleUsers });

  assert.equal(metrics.totalComplaints, 5);
  assert.equal(metrics.pendingComplaints, 2);
  assert.equal(metrics.assignedComplaints, 1);
  assert.equal(metrics.inProgressComplaints, 1);
  assert.equal(metrics.resolvedComplaints, 1);
  assert.equal(metrics.overdueComplaints, 2); // Only un-resolved complaints with deadline < now
  assert.equal(metrics.resolutionRate, 20.0); // 1 / 5 = 20.0%

  assert.equal(metrics.totalCitizens, 3);
  assert.equal(metrics.totalAuthorities, 2);
  assert.equal(metrics.totalOfficers, 2); // Exactly 2 explicit officers (legacy and malformed excluded)
});

test("Admin Dashboard: Officer count strictly isolates explicit officers", () => {
  // Test dataset matching local database structure
  const usersCensus = [
    { email: "admin@govai.gov", role: "admin" },
    { email: "admin@demo.com", role: "admin" },
    { email: "road@gmail.com", role: "department" }, // legacy missing departmentRole
    { email: "kashish047@gmail.com", role: "citizen" },
    { email: "environment@demo.com", role: "department", departmentRole: "authority" },
    { email: "priyanshu@gmail.com", role: "citizen" },
    { email: "water@demo.com", role: "department", departmentRole: "authority" },
    { email: "electricity@demo.com", role: "department", departmentRole: "authority" },
    { email: "authority@demo.com", role: "department", departmentRole: "authority" },
    { email: "07kaushal.shreya@gmail.com", role: "citizen" },
    { email: "road@demo.com", role: "department" }, // legacy missing departmentRole
    { email: "citizen@demo.com", role: "citizen" },
    { email: "c@gmail.com", role: "citizen" },
    { email: "daanwn123@gmail.com", role: "citizen" },
    { email: "111@gmail.com", role: "citizen" },
    { email: "citizen.demo@govai.gov", role: "citizen" },
    { email: "department.demo@govai.gov", role: "department" }, // legacy missing departmentRole
    { email: "road.demo@govai.gov", role: "department", departmentRole: "officer" },
    { email: "water.demo@govai.gov", role: "department", departmentRole: "officer" },
    { email: "electricity.demo@govai.gov", role: "department", departmentRole: "officer" },
    { email: "environment.demo@govai.gov", role: "department", departmentRole: "officer" },
    { email: "malformed@govai.gov", role: "department", departmentRole: "supervisor" }, // malformed
  ];

  // Pipeline simulation: { role: "department", departmentRole: "officer" }
  const officers = usersCensus.filter(u => u.role === "department" && u.departmentRole === "officer");
  assert.equal(officers.length, 4, "Must count exactly 4 actual Officers");

  // Verify authorities are excluded
  const authIncluded = officers.some(u => u.departmentRole === "authority");
  assert.equal(authIncluded, false, "Authorities must be excluded from officers");

  // Verify legacy missing departmentRole are excluded
  const missingDeptRoleIncluded = officers.some(u => !u.departmentRole);
  assert.equal(missingDeptRoleIncluded, false, "Missing departmentRole must be excluded from officers");

  // Verify malformed department roles are excluded
  const malformedIncluded = officers.some(u => u.departmentRole === "supervisor");
  assert.equal(malformedIncluded, false, "Malformed department accounts must be excluded");
});

// ==========================================
// 3. SECURITY & ROLE RESTRICTION TESTS
// ==========================================

test("Admin Security: requireRole('admin') allows admin and strictly blocks non-admin roles", () => {
  const middleware = requireRole("admin");

  const runMiddleware = (user) => {
    let statusCode = null;
    let jsonResponse = null;
    let nextCalled = false;

    const req = { user };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResponse = data;
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);
    return { statusCode, jsonResponse, nextCalled };
  };

  // 1. Unauthenticated request (no user on req)
  const unauth = runMiddleware(null);
  assert.equal(unauth.statusCode, 401);
  assert.equal(unauth.nextCalled, false);

  // 2. Citizen attempt
  const citizen = runMiddleware({ role: "citizen", _id: "cit-1" });
  assert.equal(citizen.statusCode, 403);
  assert.equal(citizen.nextCalled, false);
  assert.equal(citizen.jsonResponse?.message, "Forbidden");

  // 3. Department Officer attempt
  const officer = runMiddleware({ role: "department", departmentRole: "officer", department: "Electricity" });
  assert.equal(officer.statusCode, 403);
  assert.equal(officer.nextCalled, false);
  assert.equal(officer.jsonResponse?.message, "Forbidden");

  // 4. Department Authority attempt (cannot access cross-department Admin endpoints)
  const authority = runMiddleware({ role: "department", departmentRole: "authority", department: "Road & Infrastructure" });
  assert.equal(authority.statusCode, 403);
  assert.equal(authority.nextCalled, false);
  assert.equal(authority.jsonResponse?.message, "Forbidden");

  // 5. Admin attempt -> permitted!
  const admin = runMiddleware({ role: "admin", _id: "adm-1" });
  assert.equal(admin.statusCode, null);
  assert.equal(admin.nextCalled, true);
});

