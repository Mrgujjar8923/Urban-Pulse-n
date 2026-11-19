# GovAI Database Selection Final Report

## Result

The backend now explicitly uses the Atlas cluster's `govai` database. The live backend reports:

```text
database: govai
actualDatabase: govai
readyState: 1
```

No MongoDB documents were modified during this recovery.

## Root cause

The original Atlas URI did not include a database path, and Mongoose had no explicit database selection. MongoDB consequently used the default `test` database. A pre-exported shell `MONGO_URI` was also able to override `backend/.env`, because the original dotenv calls did not use `override: true`.

## Configuration audit

Inspected:

- `backend/.env`
- `backend/.env.example`
- `backend/src/config/db.js`
- `backend/src/server.js`
- `backend/src/app.js`
- `backend/package.json`
- `backend/src/models/User.js`
- `backend/src/models/Complaint.js`
- `backend/src/models/Member.js`
- `backend/src/models/Feedback.js`
- `backend/src/models/Notification.js`
- `backend/src/controllers/auth.controller.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/middleware/auth.middleware.js`
- `frontend/vite.config.ts`

Findings:

- `MONGO_URI` is the active connection variable.
- `MONGO_DB_NAME=govai` is now present.
- No `MONGODB_URI` usage was found.
- No additional MongoDB connection was found.
- No `mongoose.createConnection()` usage was found.
- All five models use the default Mongoose connection.
- Vite proxies `/api` and `/health` to port 5000.

## Changes applied

### `backend/src/config/db.js`

- Explicitly selects `MONGO_DB_NAME`.
- Defaults safely to `govai`.
- Refuses startup if the selected database is not `govai`.
- Passes `dbName` explicitly to Mongoose.
- Logs only safe host, database, ready-state, and actual database metadata after connection.

### `backend/src/server.js` and `backend/src/app.js`

- Changed dotenv initialization to `dotenv.config({ override: true })`, ensuring the intended local backend environment file wins over stale exported shell variables.

### `backend/.env`

- Configured the Atlas URI for the `govai` database.
- Added `MONGO_DB_NAME=govai`.
- Credentials remain local and are not included in this report.

## Database verification

### Before correction

- Effective database: `test`
- `test.users`: 1 document
- `test` did not contain `admin@govai.gov`

### After correction

- Effective database: `govai`
- `govai.users`: 21
- `govai.complaints`: 18
- `govai.members`: 4
- `govai.feedbacks`: 0
- `govai.notifications`: 14

Existing admin verification:

- Email: `admin@govai.gov`
- Role: `admin`
- Status: `active`
- Password hash present with expected bcrypt hash length
- Password hash was not printed or changed

The `test` database was inspected read-only and remains untouched:

- `users`: 1
- `complaints`: 0
- `members`: 0
- `feedbacks`: 0
- `notifications`: 0

## Model verification

All models share the same active Mongoose connection and database:

| Model | Collection | Database |
|---|---|---|
| User | users | govai |
| Complaint | complaints | govai |
| Member | members | govai |
| Feedback | feedbacks | govai |
| Notification | notifications | govai |

Therefore registration, login, complaints, members, feedback, and notifications use the same `govai` connection.

## Application verification

- Backend health endpoint: passed (`200`, `{"status":"ok"}`)
- Mongoose live database: passed (`govai`)
- Existing admin lookup: passed
- Model connection verification: passed
- Backend tests: passed, 135/135
- Admin login attempt using the locally configured demo credential: failed with `Invalid credentials`
- JWT and `/api/auth/me`: not attempted because login did not issue a token

The remaining login failure is credential-specific, not database-selection-specific: the active `govai.users` admin account exists and is active, but the tested password did not match its stored hash. No password was reset or modified.

## Preservation confirmation

- `govai` was not deleted or migrated.
- `test` was not deleted.
- No collections were dropped.
- No users, roles, password hashes, members, complaints, feedbacks, notifications, or SLA records were modified.
- No seed or migration scripts were run.
- No new test user or complaint was created.
- No credentials, password hashes, or tokens are included in this report.
