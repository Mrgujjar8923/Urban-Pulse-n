# GovAI approved-scope rollback plan — NOT EXECUTED

This is a guarded rollback plan for the nine approved fields/relationships only. It must be used only if the approved migration has first completed and its results are confirmed. It is not an executable migration script.

Within one MongoDB transaction, restore the seven department accounts' `departmentRole` fields to their backed-up state (field absent), and restore the two approved Member `userId` fields to their backed-up state (field absent):

- `$unset: { departmentRole: "" }` on Users `69e08213f55981d3faedf6c5`, `69e08219f55981d3faedf6cb`, `69e0821cf55981d3faedf6ce`, `69e0821ff55981d3faedf6d1`, `6ae19e3e0febcd3d2bd50545`, `6ae19e3e0febcd3d2bd5054b`, and `6ae19e3e0febcd3d2bd5054e`, guarded by each account's exact email, `role: "department"`, department, active status, and expected post-migration role.
- `$unset: { userId: "" }` on Member `69e08221f55981d3faedf6d5` (Officer Priya) and Member `69e08223f55981d3faedf6db` (Officer Amit), guarded by exact department and current `userId` equal to the mapped officer User ID.

Abort if any guard does not match exactly one document. Verify the seven role fields and both Member `userId` fields are absent before committing. This rollback does not touch other accounts or collections. The full verified backup remains the emergency recovery source; do not restore whole collections over newer activity without reviewing intervening writes.
