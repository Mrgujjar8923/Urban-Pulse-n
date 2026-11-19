import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getOfficerPerformance } from "../src/controllers/member.controller.js";
import { Member } from "../src/models/Member.js";
import { Complaint } from "../src/models/Complaint.js";

const sampleId = () => new mongoose.Types.ObjectId();

const createMockReqRes = ({ body = {}, params = {}, query = {}, user = {} } = {}) => {
  let statusCode = 200;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
  };
  return {
    req: { body, params, query, user },
    res,
    getResult: () => ({ status: statusCode, json: jsonPayload }),
  };
};

test("Phase 8.15: 1. Citizen request to officer performance is rejected with HTTP 403", async () => {
  const { req, res, getResult } = createMockReqRes({
    user: { _id: sampleId(), role: "citizen", name: "Citizen John" },
  });

  await getOfficerPerformance(req, res);
  const result = getResult();

  assert.equal(result.status, 403);
  assert.match(result.json.message, /restricted to department authorities/i);
});

test("Phase 8.15: 2. Officer request to officer performance is rejected with HTTP 403", async () => {
  const { req, res, getResult } = createMockReqRes({
    user: {
      _id: sampleId(),
      role: "department",
      departmentRole: "officer",
      department: "Water Supply",
      name: "Officer Priya",
    },
  });

  await getOfficerPerformance(req, res);
  const result = getResult();

  assert.equal(result.status, 403);
  assert.match(result.json.message, /restricted to department authorities/i);
});

test("Phase 8.15: 3. Admin request to Authority-only performance is rejected with HTTP 403", async () => {
  const { req, res, getResult } = createMockReqRes({
    user: { _id: sampleId(), role: "admin", name: "Admin Executive" },
  });

  await getOfficerPerformance(req, res);
  const result = getResult();

  assert.equal(result.status, 403);
  assert.match(result.json.message, /restricted to department authorities/i);
});

test("Phase 8.15: 4. Authority with missing or invalid department is rejected with HTTP 400", async () => {
  const { req, res, getResult } = createMockReqRes({
    user: {
      _id: sampleId(),
      role: "department",
      departmentRole: "authority",
      department: "Invalid Department",
    },
  });

  await getOfficerPerformance(req, res);
  const result = getResult();

  assert.equal(result.status, 400);
  assert.match(result.json.message, /invalid or missing department/i);
});

test("Phase 8.15: 5. Water Authority sees ONLY Water Supply Officers and complaints (department isolation)", async () => {
  const authorityId = sampleId();
  const waterOfficerId = sampleId();
  const waterOfficerUserId = sampleId();
  const _roadOfficerId = sampleId();

  const origMemberFind = Member.find;
  const origComplaintFind = Complaint.find;

  let memberFilterCaptured = null;
  let complaintFilterCaptured = null;

  Member.find = (filter) => {
    memberFilterCaptured = filter;
    return {
      populate: () => ({
        sort: () => ({
          lean: async () => [
            {
              _id: waterOfficerId,
              name: "Officer Priya",
              department: "Water Supply",
              userId: {
                _id: waterOfficerUserId,
                name: "Officer Priya",
                email: "priya@water.govai.in",
                status: "active",
                role: "department",
                departmentRole: "officer",
              },
            },
          ],
        }),
      }),
    };
  };

  Complaint.find = (filter) => {
    complaintFilterCaptured = filter;
    return {
      populate: () => ({
        lean: async () => [
          {
            _id: sampleId(),
            title: "Water pipe burst",
            category: "Water Supply",
            status: "Assigned",
            assignedTo: waterOfficerId,
            feedback: null,
          },
        ],
      }),
    };
  };

  try {
    const { req, res, getResult } = createMockReqRes({
      user: {
        _id: authorityId,
        role: "department",
        departmentRole: "authority",
        department: "Water Supply",
        name: "Water Authority Supervisor",
      },
    });

    await getOfficerPerformance(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(memberFilterCaptured.department, "Water Supply");
    assert.equal(complaintFilterCaptured.category, "Water Supply");
    assert.equal(result.json.department, "Water Supply");
    assert.equal(result.json.officers.length, 1);
    assert.equal(result.json.officers[0].name, "Officer Priya");
    assert.equal(result.json.officers[0].status, "active");
    assert.equal(result.json.officers[0].isLinked, true);
    assert.equal(result.json.officers[0].assignedComplaints, 1);
    assert.equal(result.json.officers[0].pendingComplaints, 1);
    assert.equal(result.json.officers[0].resolvedComplaints, 0);
    assert.equal(result.json.officers[0].avgRating, null); // "Not Rated"
  } finally {
    Member.find = origMemberFind;
    Complaint.find = origComplaintFind;
  }
});

test("Phase 8.15: 6. Unlinked and inactive Officers display correct status; Not Rated when no feedback", async () => {
  const authorityId = sampleId();
  const unlinkedOfficerId = sampleId();
  const inactiveOfficerId = sampleId();
  const inactiveUserId = sampleId();

  const origMemberFind = Member.find;
  const origComplaintFind = Complaint.find;

  Member.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: unlinkedOfficerId,
            name: "Officer Rajesh",
            department: "Road & Infrastructure",
            userId: null,
          },
          {
            _id: inactiveOfficerId,
            name: "Officer Neha",
            department: "Road & Infrastructure",
            userId: {
              _id: inactiveUserId,
              name: "Officer Neha",
              email: "neha@road.govai.in",
              status: "pending",
              role: "department",
              departmentRole: "officer",
            },
          },
        ],
      }),
    }),
  });

  Complaint.find = () => ({
    populate: () => ({
      lean: async () => [
        {
          _id: sampleId(),
          category: "Road & Infrastructure",
          status: "Assigned",
          assignedTo: unlinkedOfficerId,
          feedback: null,
        },
      ],
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      user: {
        _id: authorityId,
        role: "department",
        departmentRole: "authority",
        department: "Road & Infrastructure",
      },
    });

    await getOfficerPerformance(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(result.json.summary.totalOfficers, 2);
    assert.equal(result.json.summary.activeOfficers, 0); // 0 active

    const rajesh = result.json.officers.find((o) => o.name === "Officer Rajesh");
    assert.ok(rajesh);
    assert.equal(rajesh.isLinked, false);
    assert.equal(rajesh.status, "inactive");
    assert.equal(rajesh.avgRating, null); // Not Rated
    assert.equal(rajesh.feedbackCount, 0);

    const neha = result.json.officers.find((o) => o.name === "Officer Neha");
    assert.ok(neha);
    assert.equal(neha.isLinked, true);
    assert.equal(neha.status, "inactive"); // pending account
    assert.equal(neha.avgRating, null); // Not Rated
  } finally {
    Member.find = origMemberFind;
    Complaint.find = origComplaintFind;
  }
});

test("Phase 8.15: 7. Performance calculations: Authority resolution vs Officer resolution and feedback math", async () => {
  const authorityId = sampleId();
  const officerMemberId = sampleId();
  const officerUserId = sampleId();

  const origMemberFind = Member.find;
  const origComplaintFind = Complaint.find;

  Member.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: officerMemberId,
            name: "Officer Amit",
            department: "Electricity",
            userId: {
              _id: officerUserId,
              name: "Officer Amit",
              email: "amit@electricity.govai.in",
              status: "active",
              role: "department",
              departmentRole: "officer",
            },
          },
        ],
      }),
    }),
  });

  // Complaint 1: Resolved by Officer Amit with 5-star feedback
  // Complaint 2: Assigned to Officer Amit, but resolved directly by Authority with 4-star feedback
  // Complaint 3: Assigned to Officer Amit, In Progress (pending)
  Complaint.find = () => ({
    populate: () => ({
      lean: async () => [
        {
          _id: sampleId(),
          category: "Electricity",
          status: "Resolved",
          assignedTo: officerMemberId,
          resolutionHistory: [
            {
              remarks: "Transformer fixed by field officer",
              resolvedBy: officerUserId,
              resolvedAt: new Date(),
            },
          ],
          feedback: {
            rating: 5,
            workCompleted: true,
            comment: "Excellent quick repair!",
          },
        },
        {
          _id: sampleId(),
          category: "Electricity",
          status: "Resolved",
          assignedTo: officerMemberId,
          resolutionHistory: [
            {
              remarks: "Emergency override resolution by supervisor",
              resolvedBy: authorityId, // Resolved by Authority!
              resolvedAt: new Date(),
            },
          ],
          feedback: {
            rating: 4,
            workCompleted: true,
            comment: "Supervisor helped resolve.",
          },
        },
        {
          _id: sampleId(),
          category: "Electricity",
          status: "In Progress",
          assignedTo: officerMemberId,
          feedback: null,
        },
      ],
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      user: {
        _id: authorityId,
        role: "department",
        departmentRole: "authority",
        department: "Electricity",
      },
    });

    await getOfficerPerformance(req, res);
    const result = getResult();

    assert.equal(result.status, 200);

    // Summary checks
    assert.equal(result.json.summary.totalOfficers, 1);
    assert.equal(result.json.summary.activeOfficers, 1);
    assert.equal(result.json.summary.totalAssignedComplaints, 3);
    assert.equal(result.json.summary.resolvedComplaints, 2);
    assert.equal(result.json.summary.pendingComplaints, 1);
    assert.equal(result.json.summary.authorityResolvedComplaints, 1); // 1 resolved by authority
    assert.equal(result.json.summary.feedbackSummary.totalFeedbacks, 2);
    assert.equal(result.json.summary.feedbackSummary.avgRating, 4.5);
    assert.equal(result.json.summary.feedbackSummary.percentSatisfied, 100);

    // Officer checks
    const amit = result.json.officers[0];
    assert.equal(amit.name, "Officer Amit");
    assert.equal(amit.assignedComplaints, 3);
    assert.equal(amit.pendingComplaints, 1);
    // CRITICAL: Complaint 2 was resolved by Authority, so Amit has ONLY 1 resolution!
    assert.equal(amit.resolvedComplaints, 1);
    assert.equal(amit.resolutionRate, 33); // 1 / 3 = 33%
    assert.equal(amit.feedbackCount, 2);
    assert.equal(amit.avgRating, 4.5);
  } finally {
    Member.find = origMemberFind;
    Complaint.find = origComplaintFind;
  }
});
