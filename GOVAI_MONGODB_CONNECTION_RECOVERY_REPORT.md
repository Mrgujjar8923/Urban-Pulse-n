# GovAI MongoDB Connection Recovery Report

## Status

Database selection was diagnosed and corrected in configuration. Final application restart and login verification are blocked by Atlas authentication failure for the supplied database-user credential.

## Root cause

The active URI selected the Atlas cluster without a database path:

- The URI selected the cluster but did not select `govai`.
- Mongoose had no explicit `dbName` option.
- MongoDB therefore used its default database, `test`.

An additional runtime issue was found: an exported shell-level `MONGO_URI` existed. `dotenv` does not override an already-exported variable, so that variable could replace the value in `backend/.env`.

## Read-only verification before correction

Using the existing Atlas connection, Mongoose reported:

- Host: Atlas cluster host (redacted)
- Database: `test`
- Ready state: `1`
- Users in `test.users`: `1`
- `admin@govai.gov` in `test.users`: not found

Using the same Atlas cluster with the intended database selected read-only:

- Database: `govai`
- Users in `govai.users`: `21`
- `admin@govai.gov`: found
- Admin status: `active`
- Admin role: `admin`
- Role census: 2 admins, 8 citizens, 11 department users
- Department role census: 4 authorities, 4 officers, 3 unset legacy values

No password hashes were read or printed.

## Configuration inspected

- `backend/.env`
- `backend/.env.example`
- `backend/src/config/db.js`
- `backend/src/server.js`
- `backend/src/app.js`
- `backend/package.json`
- `frontend/vite.config.ts`
- `backend/src/models/User.js`
- `backend/src/controllers/auth.controller.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/middleware/auth.middleware.js`
- `frontend/src/services/apiClient.ts`
- `frontend/.env.development.local`

## Configuration change applied

`backend/src/config/db.js` now:

- Selects `MONGO_DB_NAME` with a safe default of `govai`.
- Refuses startup if the selected database is not exactly `govai`.
- Passes `dbName: "govai"` explicitly to Mongoose.

The local `backend/.env` was updated to include the `govai` database path and:

```text
MONGO_DB_NAME=govai
```

The Atlas credential itself was not changed in Atlas. The local value supplied for testing was not accepted by Atlas.

## Authentication flow review

- `User` is a standard Mongoose model and therefore uses the default connection.
- Login queries `User.findOne({ email })`.
- The schema lowercases and trims email values.
- Password verification uses `bcryptjs.compare` through `user.comparePassword`.
- JWT generation uses the configured `JWT_SECRET`.
- `/api/auth/me` uses the same `User` model and connection.
- Frontend login calls `/api/auth/login` through the Vite proxy to port 5000.

The previous `Invalid credentials` result was caused by querying `test.users`, where the original admin account does not exist. Login cannot be re-tested after the configuration correction until Atlas authentication succeeds.

## Final verification status

Blocked because Atlas returns:

```text
bad auth : authentication failed
```

The backend health endpoint cannot start while Atlas rejects the database-user credential. Consequently, JWT, `/api/auth/me`, and dashboard verification remain pending.

## Data safety confirmation

- No users were created, deleted, or modified by this recovery.
- No password hashes, roles, member mappings, complaints, feedback, notifications, or SLA records were modified.
- No seed or migration scripts were run.
- The `test` database was not deleted or changed.
- The `govai` database was only queried read-only during verification.
- No MongoDB credentials or JWTs are included in this report.

## Required next step

Verify or reset the existing Atlas **database user** credential for `govaiprojdb` in Atlas Database Access. This is separate from the Atlas website login password. After a valid credential is available, restart the backend with the corrected configuration and complete the pending authentication checks.
