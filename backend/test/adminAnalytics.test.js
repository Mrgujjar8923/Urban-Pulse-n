import test from "node:test";
import assert from "node:assert/strict";
import {
  getPreviousPeriodDates,
  buildAnalyticsMatch,
} from "../src/controllers/adminAnalytics.controller.js";
import { authMiddleware } from "../src/middleware/auth.middleware.js";
import { requireRole } from "../src/middleware/role.middleware.js";

test("Admin Analytics: buildAnalyticsMatch validates departments strictly", () => {
  // Valid department
  const validMatch = buildAnalyticsMatch({ department: "Water Supply" });
  assert.equal(validMatch.category, "Water Supply");

  // All Departments
  const allDeptMatch = buildAnalyticsMatch({ department: "All Departments" });
  assert.equal(allDeptMatch.category, undefined);

  // Invalid department throws 400
  assert.throws(
    () => buildAnalyticsMatch({ department: "InvalidDepartment" }),
    (err) => err.status === 400 && err.message.includes("Invalid department")
  );
});

test("Admin Analytics: buildAnalyticsMatch supports custom dates and relative ranges", () => {
  // Custom dates
  const custom = buildAnalyticsMatch({
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-06-30T23:59:59.999Z",
  });
  assert.ok(custom.createdAt);
  assert.ok(custom.createdAt.$gte);
  assert.ok(custom.createdAt.$lte);

  // Relative range
  const relative = buildAnalyticsMatch({ dateRange: "last30Days" });
  assert.ok(relative.createdAt.$gte);

  // allTime produces empty filter
  const allTime = buildAnalyticsMatch({ dateRange: "allTime" });
  assert.equal(allTime.createdAt, undefined);
});

test("Admin Analytics: getPreviousPeriodDates calculates matching historical windows", () => {
  // last7Days should return window 7-14 days in the past
  const prev7d = getPreviousPeriodDates("last7Days");
  assert.ok(prev7d);
  assert.ok(prev7d.prevStart instanceof Date);
  assert.ok(prev7d.prevEnd instanceof Date);
  const diffDays = Math.round((prev7d.prevEnd.getTime() - prev7d.prevStart.getTime()) / (1000 * 60 * 60 * 24));
  assert.equal(diffDays, 7);

  // Custom date duration window
  const customPrev = getPreviousPeriodDates(
    undefined,
    "2026-06-10T00:00:00.000Z",
    "2026-06-20T00:00:00.000Z"
  );
  assert.ok(customPrev);
  const customDurationDays = Math.round(
    (customPrev.prevEnd.getTime() - customPrev.prevStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  assert.equal(customDurationDays, 10);
  assert.equal(customPrev.prevEnd.toISOString(), "2026-06-10T00:00:00.000Z");

  // allTime returns null
  assert.equal(getPreviousPeriodDates("allTime"), null);
});

test("Admin Analytics: Division-by-zero safeguards and rate math", () => {
  // 0 total complaints -> 0% resolution rate
  const computeResolutionRate = (resolved, total) =>
    total > 0 ? Number(((resolved / total) * 100).toFixed(1)) : 0;

  assert.equal(computeResolutionRate(0, 0), 0);
  assert.equal(computeResolutionRate(5, 10), 50.0);
  assert.equal(computeResolutionRate(1, 3), 33.3);

  // SLA compliance rate: default 100% when no items tracked
  const computeSlaCompliance = (compliant, totalTracked) =>
    totalTracked > 0 ? Number(((compliant / totalTracked) * 100).toFixed(1)) : 100;

  assert.equal(computeSlaCompliance(0, 0), 100);
  assert.equal(computeSlaCompliance(4, 5), 80.0);
  assert.equal(computeSlaCompliance(0, 5), 0.0);

  // Median duration math
  const computeMedian = (durations) => {
    if (durations.length === 0) return 0;
    const sorted = [...durations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1))
      : Number(sorted[mid].toFixed(1));
  };

  assert.equal(computeMedian([]), 0);
  assert.equal(computeMedian([10]), 10);
  assert.equal(computeMedian([2, 8, 4]), 4);
  assert.equal(computeMedian([1, 2, 8, 10]), 5.0);
});

test("Admin Analytics: Priority normalization handles undefined and legacy values", () => {
  const normalizePriority = (prio) => {
    if (!prio || !["Critical", "High", "Medium", "Low"].includes(prio)) {
      return "Unknown";
    }
    return prio;
  };

  assert.equal(normalizePriority("Critical"), "Critical");
  assert.equal(normalizePriority("High"), "High");
  assert.equal(normalizePriority(undefined), "Unknown");
  assert.equal(normalizePriority(null), "Unknown");
  assert.equal(normalizePriority("Urgent"), "Unknown");
});

test("Admin Analytics Security: requireRole('admin') strictly guards analytics endpoints", () => {
  const adminGuard = requireRole("admin");

  // Admin user allowed
  let nextCalled = false;
  const adminReq = { user: { role: "admin" } };
  const mockRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  adminGuard(adminReq, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  // Citizen rejected with 403
  nextCalled = false;
  const citizenReq = { user: { role: "citizen" } };
  const citizenRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  adminGuard(citizenReq, citizenRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(citizenRes.statusCode, 403);

  // Department Authority rejected with 403
  const authReq = { user: { role: "department", departmentRole: "authority" } };
  const authRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  adminGuard(authReq, authRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(authRes.statusCode, 403);
});

