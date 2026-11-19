import assert from "node:assert/strict";
import test from "node:test";
import {
  notifyComplaintAssignment,
  notifyComplaintStatusChanged,
  notifyDepartmentUsers,
  notifyFeedbackReceived,
} from "../src/services/complaintNotification.service.js";

const complaint = {
  _id: "complaint-1",
  category: "Water Supply",
};

const createUserModel = (users) => ({
  find(query) {
    assert.deepEqual(query, {
      status: "active",
      role: "department",
      departmentRole: "authority",
      department: "Water Supply",
    });
    return {
      select(fields) {
        assert.equal(fields, "_id");
        return {
          lean: async () => users,
        };
      },
    };
  },
});

const createFilteringUserModel = (users) => ({
  find(query) {
    const eligibleUsers = users.filter((user) => (
      user.status === query.status
      && user.role === query.role
      && (!query.departmentRole || user.departmentRole === query.departmentRole)
      && user.department === query.department
    ));
    return {
      select() {
        return {
          lean: async () => eligibleUsers.map(({ _id }) => ({ _id })),
        };
      },
    };
  },
});

const createLogger = () => ({
  errors: [],
  error(...args) {
    this.errors.push(args);
  },
});

test("creates and emits notifications for matching active department users", async () => {
  const users = [{ _id: "water-user-1" }, { _id: "water-user-2" }];
  const persisted = [];
  const emitted = [];
  const logger = createLogger();

  const result = await notifyDepartmentUsers(complaint, {
    userModel: createUserModel(users),
    notificationModel: {
      async create(notification) {
        persisted.push(notification);
        return notification;
      },
    },
    async emit(notification) {
      emitted.push(notification);
      return true;
    },
    logger,
  });

  assert.equal(result.created, 2);
  assert.equal(result.emitted, 2);
  assert.deepEqual(persisted.map(({ userId }) => userId), ["water-user-1", "water-user-2"]);
  assert.deepEqual(emitted, persisted);
  assert.equal(logger.errors.length, 0);
  assert.equal(persisted[0].meta.type, "complaint_submitted");
  assert.equal(persisted[0].meta.complaintId, "complaint-1");
  assert.equal(persisted[0].dedupeKey, "complaint-1:complaint-submitted:water-user-1");
});

test("handles no eligible department users without creating notifications", async () => {
  let createCalls = 0;

  const result = await notifyDepartmentUsers(complaint, {
    userModel: createUserModel([]),
    notificationModel: {
      async create() {
        createCalls += 1;
      },
    },
    logger: createLogger(),
  });

  assert.deepEqual(result, { created: 0, emitted: 0 });
  assert.equal(createCalls, 0);
});

test("excludes inactive, unrelated, and officer department users from intake notifications", async () => {
  const persistedUserIds = [];

  await notifyDepartmentUsers(complaint, {
    userModel: createFilteringUserModel([
      { _id: "inactive-water-user", status: "inactive", role: "department", departmentRole: "authority", department: "Water Supply" },
      { _id: "road-user", status: "active", role: "department", departmentRole: "authority", department: "Road & Infrastructure" },
      { _id: "active-water-authority", status: "active", role: "department", departmentRole: "authority", department: "Water Supply" },
      { _id: "active-water-officer", status: "active", role: "department", departmentRole: "officer", department: "Water Supply" },
      { _id: "admin-user", status: "active", role: "admin", department: undefined },
    ]),
    notificationModel: {
      async create(notification) {
        persistedUserIds.push(notification.userId);
        return notification;
      },
    },
    logger: createLogger(),
  });

  assert.deepEqual(persistedUserIds, ["active-water-authority"]);
});

test("persists before emitting and preserves persistence when socket emission fails", async () => {
  const order = [];
  const logger = createLogger();

  const result = await notifyDepartmentUsers(complaint, {
    userModel: createUserModel([{ _id: "water-user-1" }]),
    notificationModel: {
      async create(notification) {
        order.push("persist");
        return notification;
      },
    },
    async emit() {
      order.push("emit");
      throw new Error("socket unavailable");
    },
    logger,
  });

  assert.deepEqual(order, ["persist", "emit"]);
  assert.deepEqual(result, { created: 1, emitted: 0 });
  assert.equal(logger.errors.length, 1);
  assert.match(logger.errors[0][0], /Socket emission/);
});

test("logs persistence errors and continues with other recipients", async () => {
  const persistedUserIds = [];
  const logger = createLogger();

  const result = await notifyDepartmentUsers(complaint, {
    userModel: createUserModel([{ _id: "water-user-1" }, { _id: "water-user-2" }]),
    notificationModel: {
      async create(notification) {
        if (notification.userId === "water-user-1") throw new Error("database unavailable");
        persistedUserIds.push(notification.userId);
        return notification;
      },
    },
    async emit() {
      return true;
    },
    logger,
  });

  assert.deepEqual(persistedUserIds, ["water-user-2"]);
  assert.deepEqual(result, { created: 1, emitted: 1 });
  assert.equal(logger.errors.length, 1);
  assert.match(logger.errors[0][0], /Persistence/);
  assert.equal(logger.errors[0][1].userId, "water-user-1");
});

test("notifies the complaint owner after a meaningful status change", async () => {
  const persisted = [];
  const complaintWithOwner = {
    ...complaint,
    createdBy: "citizen-1",
    status: "Resolved",
    updatedAt: new Date("2026-10-29T10:00:00Z"),
  };

  const result = await notifyComplaintStatusChanged(complaintWithOwner, "In Progress", {
    userModel: {
      findOne(query) {
        assert.deepEqual(query, { _id: "citizen-1", status: "active", role: "citizen" });
        return {
          select() {
            return { lean: async () => ({ _id: "citizen-1" }) };
          },
        };
      },
    },
    notificationModel: {
      async create(notification) {
        persisted.push(notification);
        return notification;
      },
    },
    async emit() {
      return true;
    },
    logger: createLogger(),
  });

  assert.deepEqual(result, { created: 1, emitted: 1 });
  assert.equal(persisted[0].userId, "citizen-1");
  assert.equal(persisted[0].meta.type, "complaint_resolved");
});

test("does not notify the owner when the status is unchanged", async () => {
  let lookupCalls = 0;

  const result = await notifyComplaintStatusChanged(
    { ...complaint, status: "Assigned" },
    "Assigned",
    {
      userModel: {
        findOne() {
          lookupCalls += 1;
        },
      },
      logger: createLogger(),
    }
  );

  assert.deepEqual(result, { created: 0, emitted: 0 });
  assert.equal(lookupCalls, 0);
});

test("notifies the complaint owner after a first officer assignment", async () => {
  const persisted = [];
  const result = await notifyComplaintAssignment(
    {
      ...complaint,
      createdBy: "citizen-1",
      assignedTo: "member-1",
    },
    null,
    {
      userModel: {
        findOne() {
          return {
            select() {
              return { lean: async () => ({ _id: "citizen-1" }) };
            },
          };
        },
      },
      notificationModel: {
        async create(notification) {
          persisted.push(notification);
          return notification;
        },
      },
      async emit() {
        return true;
      },
      logger: createLogger(),
    }
  );

  assert.deepEqual(result, { created: 1, emitted: 1 });
  assert.equal(persisted[0].userId, "citizen-1");
  assert.equal(persisted[0].meta.type, "complaint_assigned");
  assert.equal(persisted[0].dedupeKey, "complaint-1:assigned:member-1");
});

test("does not notify when an officer assignment is unchanged", async () => {
  let createCalls = 0;
  const result = await notifyComplaintAssignment(
    { ...complaint, assignedTo: "member-1" },
    "member-1",
    {
      notificationModel: {
        async create() {
          createCalls += 1;
        },
      },
      logger: createLogger(),
    }
  );

  assert.deepEqual(result, { created: 0, emitted: 0 });
  assert.equal(createCalls, 0);
});

test("notifies only active users in the complaint department when feedback arrives", async () => {
  const persistedUserIds = [];

  const result = await notifyFeedbackReceived(
    complaint,
    { _id: "feedback-1" },
    {
      userModel: createFilteringUserModel([
        { _id: "water-user-1", status: "active", role: "department", department: "Water Supply" },
        { _id: "inactive-water-user", status: "inactive", role: "department", department: "Water Supply" },
      ]),
      notificationModel: {
        async create(notification) {
          persistedUserIds.push(notification.userId);
          return notification;
        },
      },
      async emit() {
        return true;
      },
      logger: createLogger(),
    }
  );

  assert.deepEqual(result, { created: 1, emitted: 1 });
  assert.deepEqual(persistedUserIds, ["water-user-1"]);
});
