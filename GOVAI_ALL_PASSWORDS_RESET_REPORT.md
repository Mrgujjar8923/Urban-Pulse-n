# GovAI All Passwords Reset Report

## Result

**STOPPED after verification failure.** The password update matched all existing
user records, but Mongoose automatic timestamps also changed `updatedAt`. This
violates the requirement that only the password hash field change. No further
database operation was performed.

## Database and Scope

- Database: `govai`
- Collection: `users`
- Original account count: 22
- Final account count: 22
- Inserted accounts: 0
- Deleted accounts: 0
- Other collections modified: none
- Hash-only backup: `backend/password-hashes-backup-20261103145708.local.json`

## Role Counts

| Account type | Count |
|---|---:|
| Citizen | 9 |
| Admin | 2 |
| Department authority | 4 |
| Department officer | 4 |
| Department user without `departmentRole` | 3 |

## Password Update

- Update field requested: `password`
- Hashing implementation: `bcryptjs`, salt rounds 10
- Matched records: 22
- Successful password updates: 22
- Bcrypt comparison against `12345678`: 22 of 22 passed

## Preservation Verification

- User IDs and account count: unchanged
- Non-password field verification: **failed**
- Failure: Mongoose `updateMany` timestamp handling changed `updatedAt` for all
  22 records
- Final state therefore cannot be certified as “only password hashes changed”
- The operation was stopped rather than guessing original timestamps from older,
  incomplete backups

## Login Verification

Representative citizen, admin, department authority, and department officer
login plus `/api/auth/me` verification was **not run**, because the required
strict preservation verification failed and the instruction required stopping on
any operation failure.
