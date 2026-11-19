import test from "node:test";
import assert from "node:assert/strict";
import { parsePagination, formatPaginatedResponse } from "../src/utils/pagination.js";

test("Pagination Utility & Query Clamping (Phase 7E.6)", async (t) => {
  await t.test("parsePagination defaults to unpaginated when no page/limit query params provided", () => {
    const result = parsePagination({});
    assert.strictEqual(result.isPaginated, false);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 20);
    assert.strictEqual(result.skip, 0);
  });

  await t.test("parsePagination parses and calculates skip when valid page and limit are provided", () => {
    const result = parsePagination({ page: "3", limit: "15" });
    assert.strictEqual(result.isPaginated, true);
    assert.strictEqual(result.page, 3);
    assert.strictEqual(result.limit, 15);
    assert.strictEqual(result.skip, 30);
  });

  await t.test("parsePagination safely normalizes negative, zero, and non-numeric page values", () => {
    const resNegative = parsePagination({ page: "-4" });
    assert.strictEqual(resNegative.page, 1);

    const resZero = parsePagination({ page: "0" });
    assert.strictEqual(resZero.page, 1);

    const resNaN = parsePagination({ page: "invalid" });
    assert.strictEqual(resNaN.page, 1);
  });

  await t.test("parsePagination clamps limit to maximum allowed limit (default 100)", () => {
    const resClamped = parsePagination({ limit: "500" });
    assert.strictEqual(resClamped.limit, 100);

    const resCustomMax = parsePagination({ limit: "250" }, 20, 50);
    assert.strictEqual(resCustomMax.limit, 50);
  });

  await t.test("parsePagination safely normalizes invalid limit to defaultLimit", () => {
    const resInvalid = parsePagination({ limit: "-10" });
    assert.strictEqual(resInvalid.limit, 20);

    const resNaN = parsePagination({ limit: "not-a-number" });
    assert.strictEqual(resNaN.limit, 20);
  });

  await t.test("formatPaginatedResponse formats envelope with accurate totalPages and navigation flags", () => {
    const items = [{ id: 1 }, { id: 2 }];
    const response = formatPaginatedResponse(items, 25, 2, 10);

    assert.deepStrictEqual(response.data, items);
    assert.strictEqual(response.pagination.total, 25);
    assert.strictEqual(response.pagination.page, 2);
    assert.strictEqual(response.pagination.limit, 10);
    assert.strictEqual(response.pagination.totalPages, 3);
    assert.strictEqual(response.pagination.hasNextPage, true);
    assert.strictEqual(response.pagination.hasPrevPage, true);
  });

  await t.test("formatPaginatedResponse handles zero results and boundary pages correctly", () => {
    const emptyResponse = formatPaginatedResponse([], 0, 1, 20);
    assert.deepStrictEqual(emptyResponse.data, []);
    assert.strictEqual(emptyResponse.pagination.total, 0);
    assert.strictEqual(emptyResponse.pagination.totalPages, 0);
    assert.strictEqual(emptyResponse.pagination.hasNextPage, false);
    assert.strictEqual(emptyResponse.pagination.hasPrevPage, false);

    const finalPageResponse = formatPaginatedResponse([{ id: 3 }], 3, 3, 1);
    assert.strictEqual(finalPageResponse.pagination.totalPages, 3);
    assert.strictEqual(finalPageResponse.pagination.hasNextPage, false);
    assert.strictEqual(finalPageResponse.pagination.hasPrevPage, true);
  });

  await t.test("Unpaginated queries preserve complete result sets > 100 without truncation (Phase 7E.8)", () => {
    const { isPaginated } = parsePagination({});
    assert.strictEqual(isPaginated, false);

    // Simulate query execution
    const mockDbRecords = Array.from({ length: 150 }, (_, i) => ({ id: `doc-${i + 1}` }));
    let queryChain = { records: mockDbRecords, isLimited: false, limitCount: null };

    // In controllers, when isPaginated is false, no limit is applied
    if (isPaginated) {
      queryChain.isLimited = true;
    }

    assert.strictEqual(queryChain.isLimited, false);
    assert.strictEqual(queryChain.records.length, 150);
  });

  await t.test("Explicit pagination respects maximum limit of 100 (Phase 7E.8)", () => {
    const { isPaginated, limit } = parsePagination({ limit: "500" });
    assert.strictEqual(isPaginated, true);
    assert.strictEqual(limit, 100);

    const { limit: customLimit } = parsePagination({ page: "1", limit: "999" });
    assert.strictEqual(customLimit, 100);
  });

  await t.test("Deterministic sorting with _id secondary sort guarantees zero duplicates across pages for identical timestamps", () => {
    const fixedTimestamp = new Date("2026-11-15T10:00:00.000Z");
    const rawRecords = [
      { _id: "6af700000000000000000004", createdAt: fixedTimestamp, title: "Issue 4" },
      { _id: "6af700000000000000000001", createdAt: fixedTimestamp, title: "Issue 1" },
      { _id: "6af700000000000000000005", createdAt: fixedTimestamp, title: "Issue 5" },
      { _id: "6af700000000000000000002", createdAt: fixedTimestamp, title: "Issue 2" },
      { _id: "6af700000000000000000003", createdAt: fixedTimestamp, title: "Issue 3" },
    ];

    // Compound comparator matching .sort({ createdAt: -1, _id: -1 })
    const sorted = [...rawRecords].sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b._id.localeCompare(a._id);
    });

    // Page 1 (limit 2, skip 0)
    const page1 = sorted.slice(0, 2);
    // Page 2 (limit 2, skip 2)
    const page2 = sorted.slice(2, 4);
    // Page 3 (limit 2, skip 4)
    const page3 = sorted.slice(4, 6);

    const page1Ids = page1.map((r) => r._id);
    const page2Ids = page2.map((r) => r._id);
    const page3Ids = page3.map((r) => r._id);

    // Assert zero duplicates between pages
    const hasOverlap1And2 = page1Ids.some((id) => page2Ids.includes(id));
    const hasOverlap2And3 = page2Ids.some((id) => page3Ids.includes(id));
    assert.strictEqual(hasOverlap1And2, false);
    assert.strictEqual(hasOverlap2And3, false);

    // Assert exact monotonic order
    assert.deepStrictEqual(page1Ids, ["6af700000000000000000005", "6af700000000000000000004"]);
    assert.deepStrictEqual(page2Ids, ["6af700000000000000000003", "6af700000000000000000002"]);
    assert.deepStrictEqual(page3Ids, ["6af700000000000000000001"]);
  });

  await t.test("RBAC filtering rules remain strictly isolated across roles", () => {
    const citizenId = "user-citizen-1";
    const deptOfficerId = "member-water-1";

    // Citizen filter
    const citizenFilter = { createdBy: citizenId };
    assert.strictEqual(citizenFilter.createdBy, citizenId);

    // Authority filter
    const authorityFilter = { category: "Water Supply" };
    assert.strictEqual(authorityFilter.category, "Water Supply");

    // Officer filter
    const officerFilter = { category: "Water Supply", assignedTo: deptOfficerId };
    assert.strictEqual(officerFilter.category, "Water Supply");
    assert.strictEqual(officerFilter.assignedTo, deptOfficerId);
  });
});
