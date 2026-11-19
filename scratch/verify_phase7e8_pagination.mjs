import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import mongoose from "../backend/node_modules/mongoose/index.js";
import assert from "node:assert/strict";

dotenv.config({ path: "./backend/.env" });

const TEST_DB_NAME = "govai_phase7e8_test";

async function runPhase7E8IntegrationTests() {
  console.log("=== GovAI Resolve — Phase 7E.8 Isolated Integration Verification ===");
  console.log(`Target database: ${TEST_DB_NAME}`);

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI not configured");
  }

  // 1. Safety check: NEVER connect to or modify live 'govai'
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });
  const connectedDb = mongoose.connection.db.databaseName;
  console.log(`Connected to: ${connectedDb}`);
  if (connectedDb !== TEST_DB_NAME) {
    throw new Error(`CRITICAL SAFETY ABORT: Connected to ${connectedDb}, expected ${TEST_DB_NAME}`);
  }

  const db = mongoose.connection.db;

  try {
    // Clean any preexisting state in isolated test db
    await db.collection("complaints").deleteMany({});
    await db.collection("users").deleteMany({});
    await db.collection("members").deleteMany({});

    console.log("\n[Test 1: Seeding 120 complaints with identical timestamp]");
    const citizenId = new mongoose.Types.ObjectId();
    const otherCitizenId = new mongoose.Types.ObjectId();
    const officerUserId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();

    await db.collection("users").insertMany([
      {
        _id: citizenId,
        name: "Test Citizen",
        email: "citizen@test.local",
        role: "citizen",
        status: "active",
        createdAt: new Date(),
      },
      {
        _id: otherCitizenId,
        name: "Other Citizen",
        email: "other@test.local",
        role: "citizen",
        status: "active",
        createdAt: new Date(),
      },
      {
        _id: officerUserId,
        name: "Officer Test",
        email: "officer@test.local",
        role: "department",
        department: "Water Supply",
        departmentRole: "officer",
        status: "active",
        createdAt: new Date(),
      },
    ]);

    await db.collection("members").insertOne({
      _id: memberId,
      name: "Officer Test Member",
      department: "Water Supply",
      userId: officerUserId,
      createdAt: new Date(),
    });

    const fixedTime = new Date("2026-11-15T12:00:00.000Z");
    const complaintsToInsert = [];

    // Create 120 complaints for citizenId (Water Supply) with fixed identical timestamp
    for (let i = 1; i <= 120; i++) {
      const hex = i.toString(16).padStart(24, "0");
      complaintsToInsert.push({
        _id: new mongoose.Types.ObjectId(hex),
        title: `Water Complaint ${i}`,
        description: `Description for complaint ${i}`,
        category: "Water Supply",
        status: i % 2 === 0 ? "Assigned" : "Pending",
        assignedTo: i % 2 === 0 ? memberId : null,
        createdBy: citizenId,
        createdAt: fixedTime,
        updatedAt: fixedTime,
      });
    }

    // Add 10 complaints for otherCitizenId (Electricity)
    for (let i = 121; i <= 130; i++) {
      const hex = i.toString(16).padStart(24, "0");
      complaintsToInsert.push({
        _id: new mongoose.Types.ObjectId(hex),
        title: `Electricity Complaint ${i}`,
        description: `Description for complaint ${i}`,
        category: "Electricity",
        status: "Pending",
        assignedTo: null,
        createdBy: otherCitizenId,
        createdAt: fixedTime,
        updatedAt: fixedTime,
      });
    }

    await db.collection("complaints").insertMany(complaintsToInsert);
    console.log(`Seeded ${complaintsToInsert.length} complaints in ${TEST_DB_NAME}.`);

    // Import controllers and models from backend
    const { getMyComplaints, getMyAssignedComplaints, getAllComplaints, getDepartmentComplaints } =
      await import("../backend/src/controllers/complaint.controller.js");

    const mockRes = () => {
      const res = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        set(k, v) {
          this.headers[k] = v;
          return this;
        },
        json(data) {
          this.jsonData = data;
          return this;
        },
      };
      return res;
    };

    console.log("\n[Test 2: Unpaginated request returns 120 records without 100-record truncation]");
    {
      const req = {
        user: { _id: citizenId, role: "citizen" },
        query: {}, // unpaginated
      };
      const res = mockRes();
      await getMyComplaints(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(Array.isArray(res.jsonData), true);
      assert.strictEqual(res.jsonData.length, 120, `Expected 120 complaints, got ${res.jsonData.length}`);
      assert.strictEqual(res.headers["X-Total-Count"], "120");
      console.log(`✔ Verified unpaginated result returns all ${res.jsonData.length} records (>100 without truncation)`);
    }

    console.log("\n[Test 3: Paginated requests across pages with deterministic secondary sort]");
    {
      // Page 1 (limit 50)
      const reqP1 = {
        user: { _id: citizenId, role: "citizen" },
        query: { page: "1", limit: "50" },
      };
      const resP1 = mockRes();
      await getMyComplaints(reqP1, resP1);

      assert.strictEqual(resP1.statusCode, 200);
      assert.strictEqual(resP1.jsonData.pagination.total, 120);
      assert.strictEqual(resP1.jsonData.pagination.page, 1);
      assert.strictEqual(resP1.jsonData.pagination.limit, 50);
      assert.strictEqual(resP1.jsonData.pagination.totalPages, 3);
      assert.strictEqual(resP1.jsonData.pagination.hasNextPage, true);
      assert.strictEqual(resP1.jsonData.data.length, 50);

      // Page 2 (limit 50)
      const reqP2 = {
        user: { _id: citizenId, role: "citizen" },
        query: { page: "2", limit: "50" },
      };
      const resP2 = mockRes();
      await getMyComplaints(reqP2, resP2);

      assert.strictEqual(resP2.jsonData.data.length, 50);
      assert.strictEqual(resP2.jsonData.pagination.page, 2);
      assert.strictEqual(resP2.jsonData.pagination.hasNextPage, true);

      // Page 3 (limit 50)
      const reqP3 = {
        user: { _id: citizenId, role: "citizen" },
        query: { page: "3", limit: "50" },
      };
      const resP3 = mockRes();
      await getMyComplaints(reqP3, resP3);

      assert.strictEqual(resP3.jsonData.data.length, 20);
      assert.strictEqual(resP3.jsonData.pagination.page, 3);
      assert.strictEqual(resP3.jsonData.pagination.hasNextPage, false);

      // Check for zero duplicates across pages
      const idsP1 = resP1.jsonData.data.map((c) => c._id.toString());
      const idsP2 = resP2.jsonData.data.map((c) => c._id.toString());
      const idsP3 = resP3.jsonData.data.map((c) => c._id.toString());

      const overlap12 = idsP1.filter((id) => idsP2.includes(id));
      const overlap23 = idsP2.filter((id) => idsP3.includes(id));
      const overlap13 = idsP1.filter((id) => idsP3.includes(id));

      assert.strictEqual(overlap12.length, 0, `Page 1 and Page 2 share duplicate IDs: ${overlap12}`);
      assert.strictEqual(overlap23.length, 0, `Page 2 and Page 3 share duplicate IDs: ${overlap23}`);
      assert.strictEqual(overlap13.length, 0, `Page 1 and Page 3 share duplicate IDs: ${overlap13}`);

      // Verify all 120 unique IDs covered
      const allIds = new Set([...idsP1, ...idsP2, ...idsP3]);
      assert.strictEqual(allIds.size, 120);

      // Verify deterministic descending order by _id
      for (let i = 0; i < idsP1.length - 1; i++) {
        assert(idsP1[i] > idsP1[i + 1], `Expected monotonic descending _id order: ${idsP1[i]} > ${idsP1[i+1]}`);
      }
      console.log("✔ Verified deterministic secondary sort: zero duplicate IDs across pages and perfect monotonic ordering");
    }

    console.log("\n[Test 4: Explicit pagination limit clamping to maxLimit 100]");
    {
      const reqClamped = {
        user: { _id: citizenId, role: "citizen" },
        query: { page: "1", limit: "500" }, // requests 500
      };
      const resClamped = mockRes();
      await getMyComplaints(reqClamped, resClamped);

      assert.strictEqual(resClamped.jsonData.pagination.limit, 100);
      assert.strictEqual(resClamped.jsonData.data.length, 100);
      assert.strictEqual(resClamped.jsonData.pagination.total, 120);
      console.log("✔ Verified limit clamping: limit=500 safely clamped to 100 records");
    }

    console.log("\n[Test 5: RBAC Isolation for Citizen, Authority, Officer, and Admin]");
    {
      // 1. Citizen RBAC: only sees their own 120 complaints (not the 10 from other citizen)
      const resCitizen = mockRes();
      await getMyComplaints({ user: { _id: citizenId, role: "citizen" }, query: {} }, resCitizen);
      assert.strictEqual(resCitizen.jsonData.length, 120);

      // 2. Department Authority RBAC: sees all Water Supply complaints (120), but not Electricity (10)
      const resAuthority = mockRes();
      await getDepartmentComplaints(
        {
          user: {
            _id: new mongoose.Types.ObjectId(),
            role: "department",
            department: "Water Supply",
            departmentRole: "authority",
          },
          query: {},
        },
        resAuthority
      );
      assert.strictEqual(resAuthority.jsonData.length, 120);

      // 3. Officer RBAC: only sees assigned complaints (60 out of 120)
      const resOfficer = mockRes();
      await getMyAssignedComplaints(
        {
          user: {
            _id: officerUserId,
            role: "department",
            department: "Water Supply",
            departmentRole: "officer",
          },
          query: {},
        },
        resOfficer
      );
      assert.strictEqual(resOfficer.jsonData.length, 60);

      // 4. Admin RBAC: sees all complaints across departments (120 + 10 = 130)
      const resAdmin = mockRes();
      await getAllComplaints({ user: { role: "admin" }, query: {} }, resAdmin);
      assert.strictEqual(resAdmin.jsonData.length, 130);
      assert.strictEqual(resAdmin.headers["X-Total-Count"], "130");

      console.log("✔ Verified RBAC: Citizen (120), Authority (120), Officer (60), Admin (130)");
    }

    console.log("\nAll integration verification tests passed successfully!");
  } finally {
    // Clean up test database
    console.log(`\nDropping isolated test database: ${TEST_DB_NAME}...`);
    await db.dropDatabase();
    console.log(`Dropped ${TEST_DB_NAME} cleanly.`);
    await mongoose.disconnect();
  }
}

runPhase7E8IntegrationTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
