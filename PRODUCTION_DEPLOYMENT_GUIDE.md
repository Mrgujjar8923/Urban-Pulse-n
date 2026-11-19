# GovAI Resolve — Single-Instance Production Deployment Guide

This guide provides end-to-end instructions for deploying GovAI Resolve in a secure, robust single-instance production environment.

---

## 1. Architecture Overview

GovAI Resolve follows a decoupled client-server architecture:
- **Frontend SPA**: React 18 + Vite + Tailwind CSS + Framer Motion. Built to static assets (`dist/`) and served via Nginx or a static web server.
- **Backend API**: Node.js 20 (Express + Socket.IO). Handles business logic, authentication, RBAC, Gemini AI triage, and real-time alerts.
- **Database**: MongoDB Atlas cloud cluster.
- **Persistent Evidence Storage**: Dedicated volume mounted at `/app/uploads` (or `./uploads`), storing user complaint and resolution photos.
- **External AI Integration**: Google Gemini API (`gemini-2.5-flash`) for automated complaint classification, sentiment, and citizen chat.

```
                    ┌─────────────────────────┐
                    │    Internet / Client    │
                    └────────────┬────────────┘
                                 │ HTTPS (443)
                                 ▼
                    ┌─────────────────────────┐
                    │   Reverse Proxy (Nginx) │
                    │    SSL/TLS Termination  │
                    └─────┬─────────────┬─────┘
                          │             │
              Static /    │             │ /api/* & /socket.io/*
                          ▼             ▼
       ┌────────────────────┐   ┌─────────────────────────┐
       │   Frontend SPA     │   │     Backend API         │
       │   (Nginx / HTML)   │   │  (Node.js 20 + Express) │
       └────────────────────┘   └──────┬────────────┬─────┘
                                       │            │
                    Local / Mounted    │            │ TLS Connection
                    Persistent Volume  ▼            ▼
                           ┌───────────────┐   ┌─────────────────┐
                           │   uploads/    │   │  MongoDB Atlas  │
                           │  (Evidence)   │   │  (GovAI Data)   │
                           └───────────────┘   └─────────────────┘
```

---

## 2. Prerequisites

| Requirement | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 | Ubuntu 24.04 LTS |
| **Node.js** | v20.12.0 LTS (Active LTS) | v20.x latest |
| **Container Engine** | Docker Engine 24.0+ & Compose v2 | Docker 26.0+ with Compose |
| **Compute** | 2 vCPU, 2 GB RAM | 2 vCPU, 4 GB RAM |
| **Storage** | 20 GB SSD with dedicated evidence volume | 50+ GB SSD persistent volume |
| **Database** | MongoDB Atlas M10+ Cluster | MongoDB Atlas M10+ with Replica Set |
| **Domain & SSL** | FQDN with valid DNS A/CNAME record | Valid SSL/TLS certificate (Let's Encrypt) |

---

## 3. Environment Configuration

### A. Backend Configuration (`backend/.env`)
Create `backend/.env` using the template at `backend/.env.example`:

```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

Configure the following variables:

```ini
# Core
NODE_ENV=production
PORT=5000
TRUST_PROXY=1

# MongoDB Atlas
MONGO_URI=mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=govai
AUTO_INDEX=false

# Security & CORS
JWT_SECRET=replace_with_a_secure_256_bit_random_secret_generated_via_openssl
FRONTEND_ORIGINS=https://resolve.govai.gov

# Google Gemini AI
GEMINI_API_KEY=AIzaSy...your_gemini_key
GEMINI_MODEL=gemini-2.5-flash

# Storage & SLA
EVIDENCE_UPLOAD_DIR=/app/uploads
ENABLE_SLA_JOB=true
SLA_ESCALATION_INTERVAL_MS=60000

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=500
RATE_LIMIT_AUTH_MAX=20
RATE_LIMIT_ASSISTANT_MAX=30
RATE_LIMIT_COMPLAINT_MAX=30
```

> [!IMPORTANT]
> - Generate `JWT_SECRET` with high entropy: `openssl rand -base64 48`.
> - Always keep `AUTO_INDEX=false` in production. Indexes must be created using the dedicated migration plan below to prevent startup locks.
> - `FRONTEND_ORIGINS` must match the public HTTPS URL of your frontend.

### B. Frontend Configuration (`frontend/.env.production`)
Create `frontend/.env.production`:

```ini
# When using Nginx reverse proxy on the same domain (recommended):
VITE_API_BASE_URL=

# If backend is hosted on a separate subdomain:
# VITE_API_BASE_URL=https://api.resolve.govai.gov
```

---

## 4. Database Setup & Index Migration Plan

### Why Production Auto-Indexing is Disabled
Mongoose's `autoIndex` feature attempts to build all indexes during application boot. On high-volume production tables, this can cause major database locks, CPU spikes, or request timeouts. GovAI Resolve explicitly disables `autoIndex` in production.

### Guarded Index Migration Execution
Before routing live traffic, execute the non-blocking index creation script against your target database.

1. **Verify Index Plan (Dry Run)**:
   ```bash
   node backend/scripts/migrate_production_indexes.mjs --dry-run
   ```

2. **Execute Non-Blocking Index Migration on Live Database**:
   The migration script requires an explicit safety token to prevent accidental execution against live production data:
   ```bash
   TARGET_DB=govai CONFIRM_LIVE_GOVAI_MIGRATION=YES_I_CONFIRM_GOVAI_PRODUCTION_INDEX_MIGRATION \
     node backend/scripts/migrate_production_indexes.mjs
   ```

This will safely build all required compound indexes in the background (`background: true`):
- `complaints`: `{ createdBy: 1, createdAt: -1 }`
- `complaints`: `{ category: 1, createdAt: -1 }`
- `complaints`: `{ category: 1, assignedTo: 1, createdAt: -1 }`
- `complaints`: `{ "sla.deadline": 1, status: 1 }`
- `complaints`: `{ clientRequestId: 1 }` (unique sparse)
- `notifications`: `{ userId: 1, createdAt: -1 }`
- `notifications`: `{ dedupeKey: 1 }` (unique sparse)
- `members`: `{ userId: 1 }` (unique partial objectId)
- `users`: `{ email: 1 }` (unique)

---

## 5. Deployment Methods

### Method 1: Docker Compose (Recommended)

1. **Build and Start Containers**:
   ```bash
   docker compose -f docker-compose.production.yml up -d --build
   ```

2. **Verify Container Health**:
   ```bash
   docker compose -f docker-compose.production.yml ps
   ```
   Both `govai-backend` and `govai-frontend` should report status `Up (healthy)`.

3. **Inspect Application Logs**:
   ```bash
   docker compose -f docker-compose.production.yml logs -f backend
   ```

---

### Method 2: Systemd + PM2 + Nginx (Bare-Metal / VPS)

#### Step 1: Build Frontend
```bash
cd frontend
npm ci
npm run build
# Built files will be in frontend/dist/
```

#### Step 2: Configure PM2 for Backend
```bash
cd backend
npm ci --omit=dev

# Start via PM2
pm2 start src/server.js --name "govai-backend" --max-memory-restart 500M -i 1
pm2 save
pm2 startup
```

#### Step 3: Configure Nginx Host
Copy `frontend/nginx.conf` directives to your host Nginx configuration (`/etc/nginx/sites-available/govai`):
```nginx
server {
    listen 80;
    server_name resolve.govai.gov;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name resolve.govai.gov;

    ssl_certificate /etc/letsencrypt/live/resolve.govai.gov/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/resolve.govai.gov/privkey.pem;

    root /var/www/govai/frontend/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 6M;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://127.0.0.1:5000/health;
    }
}
```

---

## 6. Health Checks, Monitoring & Graceful Shutdown

### Health Check Endpoint
The backend exposes a deep health check at `/health`:
- **HTTP 200 OK**: Database connected, process healthy.
  ```json
  { "status": "ok", "database": "connected" }
  ```
- **HTTP 503 Service Unavailable**: Database disconnected.
  ```json
  { "status": "degraded", "database": "disconnected" }
  ```

### Graceful Shutdown Behavior
When the container or process manager sends `SIGTERM` or `SIGINT`:
1. The background SLA escalation interval is stopped.
2. The HTTP server stops accepting new connections and finishes in-flight requests.
3. Socket.IO connections are cleanly terminated.
4. The MongoDB Atlas connection is closed.
5. If connections do not drain within 10 seconds, a watchdog timer forces termination.

---

## 7. Evidence Storage & Permissions

- In single-instance deployment, evidence images are stored on the local filesystem (`uploads/complaints/`).
- Ensure the directory permissions allow write access by the running user (`node` in Docker, UID 1000).
- **Multi-Instance Limitation**: When scaling to multiple container replicas, local filesystem storage must be replaced with a shared cloud object storage driver (AWS S3, Google Cloud Storage, or Azure Blob Storage).

---

## 8. Backup & Disaster Recovery

1. **MongoDB Atlas Continuous Backup**:
   - Enable automated point-in-time recovery (PITR) in the MongoDB Atlas console (under Backup settings).
   - Set retention to at least 7 days.
2. **Evidence Volume Snapshots**:
   - Schedule daily automated snapshots of the persistent volume mounted at `/app/uploads`.
3. **Disaster Recovery RTO & RPO**:
   - Target RPO (Recovery Point Objective): < 1 hour.
   - Target RTO (Recovery Time Objective): < 30 minutes.

---

## 9. Operational Troubleshooting Runbook

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **HTTP 503 from `/health`** | MongoDB Atlas disconnected or network timed out. | Check Atlas network whitelist (0.0.0.0/0 or server IP) and verify `MONGO_URI`. |
| **HTTP 429 Too Many Requests** | Rate limit exceeded by IP or user. | Wait 15 minutes or adjust `RATE_LIMIT_*` in `.env` if legitimate burst traffic. |
| **HTTP 413 File Too Large** | Uploaded image exceeds 5 MB. | Citizen must compress or resize image to < 5 MB before submitting. |
| **CORS Policy Error** | Frontend domain not in `FRONTEND_ORIGINS`. | Add exact frontend protocol and domain to `FRONTEND_ORIGINS` in `backend/.env`. |
| **Socket.IO Disconnects** | Reverse proxy missing WebSocket headers. | Ensure Nginx has `proxy_set_header Upgrade $http_upgrade` and `Connection "Upgrade"`. |
| **Gemini AI Timeout / Fallback** | Gemini API rate limit or network latency. | Complaints are automatically saved with fallback citizen-selected category and standard SLA. Use admin retry endpoint to re-analyze. |
