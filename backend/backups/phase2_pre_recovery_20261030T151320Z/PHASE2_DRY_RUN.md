# GovAI Phase 2 migration dry run — NOT EXECUTED

Identity check re-read from Atlas at `2026-10-30T15:17:00.365Z`. This report proposes guarded updates only. It is not authorization to execute them.

## Proposed authority role changes

All four accounts are unique, active department accounts with the expected department and currently have no `departmentRole` field.

| Account | User ID | Department | Before | Proposed after |
|---|---|---|---|---|
| authority@demo.com (Priya Nair) | `69e08213f55981d3faedf6c5` | Road & Infrastructure | field absent | `authority` |
| water@demo.com (Meera Singh) | `69e08219f55981d3faedf6cb` | Water Supply | field absent | `authority` |
| electricity@demo.com (Amit Verma) | `69e0821cf55981d3faedf6ce` | Electricity | field absent | `authority` |
| environment@demo.com (Neha Patel) | `69e0821ff55981d3faedf6d1` | Environment | field absent | `authority` |

## Proposed officer role and Member mapping changes

| Account | User ID | Member | Member ID | Role before → after | Member.userId before → after |
|---|---|---|---|---|---|
| road.demo@govai.gov | `6ae19e3e0febcd3d2bd50545` | Officer Priya (Road & Infrastructure) | `69e08221f55981d3faedf6d5` | absent → `officer` | field absent → `6ae19e3e0febcd3d2bd50545` |
| electricity.demo@govai.gov | `6ae19e3e0febcd3d2bd5054b` | Officer Amit (Electricity) | `69e08223f55981d3faedf6db` | absent → `officer` | field absent → `6ae19e3e0febcd3d2bd5054b` |
| environment.demo@govai.gov | `6ae19e3e0febcd3d2bd5054e` | Officer Neha (Environment) | `69e08223f55981d3faedf6de` | absent → `officer` | field absent; deferred |
| water.demo@govai.gov | `6ae19e3e0febcd3d2bd50548` | **No safe current Member** | — | already `officer`; no change | remains unlinked |

Road and Electricity candidates each have one existing complaint reference; those historical assignments are to the same-department Member shown above. Environment has the only Environment Member candidate, with no assigned-complaint history to corroborate the pairing. These three pairings remain proposals for review.

### Water Supply identity restriction

The only existing Water Supply Member is Officer Rajesh (`69e08222f55981d3faedf6d8`); its `userId` field is absent in both the backup BSON export and live raw document. Five Water Supply complaints reference that Member, including three explicit timeline assignment entries naming Officer Rajesh. The specified Water officer account must not be linked to this Member. No alternate Water Supply Member exists, so the account remains unlinked and no new Member is proposed.

## Explicitly excluded accounts

- `road@demo.com` — Rajesh Kumar, Road & Infrastructure, `departmentRole` absent. No promotion or other change is proposed.
- `department.demo@govai.gov` — display name `dd`, department and `departmentRole` absent. No repair is proposed; identity and department require separate review.

Each requested exact email matched one active account. No Citizen or Admin account is included in the proposed operations.

## Exact guarded operations proposed

If approved, execute the following inside one MongoDB transaction, after rechecking every precondition against the live database. Abort the entire transaction if any precondition fails or any update matches other than exactly one document.

For each of the four authority User IDs above:

```js
db.users.updateOne(
  { _id: ObjectId(USER_ID), email: EMAIL, role: "department", department: DEPARTMENT, status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "authority" } }
)
```

For the three proposed officer accounts (Road, Electricity, Environment):

```js
db.users.updateOne(
  { _id: ObjectId(USER_ID), email: EMAIL, role: "department", department: DEPARTMENT, status: "active", departmentRole: { $exists: false } },
  { $set: { departmentRole: "officer" } }
)

db.members.updateOne(
  { _id: ObjectId(MEMBER_ID), department: DEPARTMENT, userId: null },
  { $set: { userId: ObjectId(USER_ID) } }
)
```

The parameter values are exactly those shown in the tables. Expected totals: four authority role updates, three officer role updates, and three Member mapping updates. No operation is proposed for Water, `road@demo.com`, `department.demo@govai.gov`, Citizens, Admins, Complaints, Feedback, Notifications, timelines, SLA fields, or escalation records.

## Rollback plan

The transaction should roll back automatically if any guarded update or postcondition fails. If a completed transaction later needs reversal, use inverse updates guarded by the exact IDs and resulting values: unset `departmentRole` on the seven changed Users and restore the three Member `userId` fields to null. Confirm counts and mappings against the pre-recovery backup. Do not restore whole collections over newer application activity; use the verified full backup only as an emergency recovery source after reviewing intervening writes.
