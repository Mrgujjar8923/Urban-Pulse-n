# GovAI Phase 2 final pre-migration report — historical pre-write snapshot

> This report records the approved pre-migration state. The nine updates were later committed; see `POST_MIGRATION_VERIFICATION.md` for the actual transaction result.

Checked live Atlas records at `2026-10-30T15:21:45.331Z`. No live record was changed.

## Preflight results

- Full backup manifest and all five collection exports are present, parse successfully, and pass their recorded checksums/counts.
- Backup was restored into an isolated local MongoDB database; all five document counts and index counts matched.
- `BACKUP_REPORT.md`, `PHASE2_DRY_RUN.md`, and `ROLLBACK_PLAN.md` are present. The rollback plan is documentation, not an executable script.
- Every named account below matches the saved backup snapshot for `_id`, email, role, department, `departmentRole`, and status.
- All target User accounts are active department accounts in the expected departments.
- Both approved Member records have no `userId` field in raw BSON and in the backup snapshot; MongoDB's approved `{ userId: null }` guard matches each absent field. No existing Member has either approved officer `userId`.
- The deferred Environment and Water Members remain unlinked. Officer Rajesh remains linked to five historical Water complaints through `Complaint.assignedTo`.
- Atlas reports replica set topology `atlas-8sjzod-shard-0`. A read-only transaction probe succeeded and was aborted.
- Expected scope is exactly seven User `departmentRole` fields and two Member `userId` fields. No other fields or collections are in scope.

## Exact proposed before/after values

| Collection/document | Field | Before | After |
|---|---|---|---|
| User `69e08213f55981d3faedf6c5` / `authority@demo.com` | `departmentRole` | absent | `authority` |
| User `69e08219f55981d3faedf6cb` / `water@demo.com` | `departmentRole` | absent | `authority` |
| User `69e0821cf55981d3faedf6ce` / `electricity@demo.com` | `departmentRole` | absent | `authority` |
| User `69e0821ff55981d3faedf6d1` / `environment@demo.com` | `departmentRole` | absent | `authority` |
| User `6ae19e3e0febcd3d2bd50545` / `road.demo@govai.gov` | `departmentRole` | absent | `officer` |
| User `6ae19e3e0febcd3d2bd5054b` / `electricity.demo@govai.gov` | `departmentRole` | absent | `officer` |
| User `6ae19e3e0febcd3d2bd5054e` / `environment.demo@govai.gov` | `departmentRole` | absent | `officer` |
| Member `69e08221f55981d3faedf6d5` / Officer Priya | `userId` | absent | `6ae19e3e0febcd3d2bd50545` |
| Member `69e08223f55981d3faedf6db` / Officer Amit | `userId` | absent | `6ae19e3e0febcd3d2bd5054b` |

No update is proposed for Environment Member Officer Neha. The Environment officer User role will be set to `officer`, but the Member remains unlinked pending identity verification. `water.demo@govai.gov` is already an officer and remains unlinked. No update is proposed for `road@demo.com` or `department.demo@govai.gov`.

## Exact guarded operations proposed

Run all nine operations inside one transaction only after explicit user confirmation. Every operation must match exactly one document; otherwise abort the transaction. These are proposed commands, not executed commands.

```js
// Authority role fields
 db.users.updateOne(
  { _id: ObjectId("69e08213f55981d3faedf6c5"), email: "authority@demo.com", role: "department", department: "Road & Infrastructure", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "authority" } }
)
 db.users.updateOne(
  { _id: ObjectId("69e08219f55981d3faedf6cb"), email: "water@demo.com", role: "department", department: "Water Supply", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "authority" } }
)
 db.users.updateOne(
  { _id: ObjectId("69e0821cf55981d3faedf6ce"), email: "electricity@demo.com", role: "department", department: "Electricity", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "authority" } }
)
 db.users.updateOne(
  { _id: ObjectId("69e0821ff55981d3faedf6d1"), email: "environment@demo.com", role: "department", department: "Environment", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "authority" } }
)

// Officer role fields
 db.users.updateOne(
  { _id: ObjectId("6ae19e3e0febcd3d2bd50545"), email: "road.demo@govai.gov", role: "department", department: "Road & Infrastructure", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "officer" } }
)
 db.users.updateOne(
  { _id: ObjectId("6ae19e3e0febcd3d2bd5054b"), email: "electricity.demo@govai.gov", role: "department", department: "Electricity", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "officer" } }
)
 db.users.updateOne(
  { _id: ObjectId("6ae19e3e0febcd3d2bd5054e"), email: "environment.demo@govai.gov", role: "department", department: "Environment", status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "officer" } }
)

// Only approved Member links
 db.members.updateOne(
  { _id: ObjectId("69e08221f55981d3faedf6d5"), name: "Officer Priya", department: "Road & Infrastructure", userId: null },
  { $set: { userId: ObjectId("6ae19e3e0febcd3d2bd50545") } }
)
 db.members.updateOne(
  { _id: ObjectId("69e08223f55981d3faedf6db"), name: "Officer Amit", department: "Electricity", userId: null },
  { $set: { userId: ObjectId("6ae19e3e0febcd3d2bd5054b") } }
)
```

No Citizen/Admin User, account password/status, `Complaint`, `Feedback`, `Notification`, timeline, SLA, or escalation field is included. No insert, delete, upsert, or other collection write is proposed.

## Rollback

If the transaction commits and a reversal is approved, use the guarded inverse operations in `ROLLBACK_PLAN.md`: unset the seven previously absent role fields and unset the two Member `userId` fields to restore their backed-up state, inside a transaction. Abort on any mismatch. The verified full backup is available for emergency recovery; avoid restoring whole collections over later activity.

**At the time of this snapshot:** The migration had not run and approval was pending. Subsequent execution is documented in `POST_MIGRATION_VERIFICATION.md`.
