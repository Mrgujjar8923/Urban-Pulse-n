# GovAI Phase 2 post-migration verification

- Transaction: **committed successfully** at `2026-10-30T15:27:32Z`.
- Deployment: Atlas replica set; one MongoDB transaction with snapshot read concern and majority write concern.
- Write set: exactly nine guarded `updateOne` operations; each matched one and modified one document.
- Independent verification: performed over a new connection after commit; all nine updates passed.
- Rollback: not run.
- Phase 3: not started.

## Applied changes

| Document | Field | Raw before value | Verified after value |
|---|---|---|---|
| User `authority@demo.com` (`69e08213f55981d3faedf6c5`) | `departmentRole` | absent | `authority` |
| User `water@demo.com` (`69e08219f55981d3faedf6cb`) | `departmentRole` | absent | `authority` |
| User `electricity@demo.com` (`69e0821cf55981d3faedf6ce`) | `departmentRole` | absent | `authority` |
| User `environment@demo.com` (`69e0821ff55981d3faedf6d1`) | `departmentRole` | absent | `authority` |
| User `road.demo@govai.gov` (`6ae19e3e0febcd3d2bd50545`) | `departmentRole` | absent | `officer` |
| User `electricity.demo@govai.gov` (`6ae19e3e0febcd3d2bd5054b`) | `departmentRole` | absent | `officer` |
| User `environment.demo@govai.gov` (`6ae19e3e0febcd3d2bd5054e`) | `departmentRole` | absent | `officer` |
| Member Officer Priya (`69e08221f55981d3faedf6d5`) | `userId` | absent | `6ae19e3e0febcd3d2bd50545` |
| Member Officer Amit (`69e08223f55981d3faedf6db`) | `userId` | absent | `6ae19e3e0febcd3d2bd5054b` |

The raw backup and database documents had no `userId` key on Member Priya or Member Amit. MongoDB's approved `{ userId: null }` guard matches a missing field as well as explicit null; each guard matched exactly one Member. The rollback plan was corrected to unset these fields and restore their actual backed-up state.

## Preserved constraints and counts

- `water.demo@govai.gov` remains an officer and is not linked to Officer Rajesh. Rajesh's Member record remains unlinked.
- `environment.demo@govai.gov` remains unlinked to Officer Neha; its role is `officer`.
- `road@demo.com` and `department.demo@govai.gov` remain unchanged.
- No Citizen or Admin account was changed.
- No Complaint, Feedback, Notification, timeline, SLA, escalation, password, or account status record was modified.
- Post-commit counts from an independent connection:

| Collection | Count | Expected | Result |
|---|---:|---:|---|
| Users | 21 | 21 | Pass |
| Members | 4 | 4 | Pass |
| Complaints | 18 | 18 | Pass |
| Feedback | 0 | 0 | Pass |
| Notifications | 14 | 14 | Pass |

## Transaction attempts

Two earlier transaction attempts aborted before reaching the update loop and committed no writes: the first local precondition treated absent Member fields as explicit null, and the second omitted `status` from a projection used by a deferred-account check. After correcting these local checks to the raw backup state, the single committed transaction performed all nine approved updates. The independently verified values above reflect the committed transaction.

Machine-readable result: `POST_MIGRATION_VERIFICATION.json`.
