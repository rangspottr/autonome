# Autonome Deployment Guide

## Prerequisites

- **Node.js** 20 or later
- **PostgreSQL** 15 or later
- **npm** (comes with Node.js)
- `pg_dump` / `psql` (PostgreSQL client tools) for backup/restore

---

## Local Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/rangspottr/autonome.git
   cd autonome
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env and fill in all required values
   ```

4. **Create the PostgreSQL database**

   ```bash
   createdb autonome
   ```

5. **Run database migrations**

   ```bash
   node server/db/migrate.js
   ```

6. **Start the development server**

   ```bash
   npm run dev
   ```

   The Vite frontend will be available at `http://localhost:5173`.
   The Express API runs on `http://localhost:3001` (set via `PORT`).

---

## Production Deployment

1. **Build the frontend**

   ```bash
   npm run build
   ```

   Output goes to `dist/`. The Express server serves this directory in production.

2. **Set environment variables**

   Set `NODE_ENV=production` and configure all required variables (see table below).

3. **Start the server**

   `server/start.js` automatically runs all pending migrations before starting the
   HTTP server. This ensures the database schema is always in sync with the
   deployed code.

   Direct:
   ```bash
   node server/start.js
   ```

   Using PM2 (recommended for production):
   ```bash
   npm install -g pm2
   pm2 start server/start.js --name autonome
   pm2 save
   pm2 startup
   ```

   The server listens on `PORT` (default `3001`) and serves the built frontend.

   > **Note:** If the startup script cannot connect to the database or a migration
   > fails, the process exits with a non-zero code so the process manager treats
   > it as a failed deployment and does not route traffic to a broken instance.

---

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Optional | Server port (default: `3001`) |
| `NODE_ENV` | Optional | Set to `production` in production |
| `DATABASE_URL` | **Required** | PostgreSQL connection string |
| `JWT_SECRET` | **Required** | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | Optional | JWT expiry (default: `15m`) |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Optional | Refresh token lifetime (default: `7`) |
| `ENCRYPTION_KEY` | Optional | Key for encrypting webhook API keys at rest; falls back to `JWT_SECRET` |
| `STRIPE_SECRET_KEY` | **Required** | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | **Required** | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_ID` | **Required** | Stripe price ID for the subscription plan |
| `CLIENT_URL` | **Required** | Frontend origin (e.g. `https://app.autonome.com`) |
| `VITE_API_URL` | Optional | API base URL for the frontend build |
| `SMTP_HOST` | Optional | SMTP server hostname — if unset, emails are auto-verified |
| `SMTP_PORT` | Optional | SMTP port (default: `587`) |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |
| `SMTP_FROM` | Optional | From address (default: `noreply@autonome.app`) |
| `TWILIO_ACCOUNT_SID` | Optional | Twilio Account SID for SMS |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Optional | Twilio outgoing phone number |
| `ANTHROPIC_API_KEY` | **Required** | Anthropic API key for AI features |
| `AI_MODEL` | Optional | Claude model ID (default: `claude-sonnet-4-20250514`) |
| `BYPASS_SUBSCRIPTION` | **Must be `false`** | ⚠️ **Dev only** — never `true` in production (see warning below) |
| `CLEANUP_INTERVAL_HOURS` | Optional | Token cleanup interval in hours (default: `6`) |

---

## Database Migrations

Migration files are run in alphabetical/numeric order by `server/db/migrate.js`.

| File | Description |
|---|---|
| `001_initial.sql` | Core tables: users, workspaces, subscriptions, contacts, deals, invoices, tasks, workflows, audit_log, refresh_tokens, agent_runs, communications |
| `002_assets_knowledge.sql` | Assets and knowledge base tables |
| `003_password_reset.sql` | Password reset tokens table |
| `004_security.sql` | Security improvements: webhook keys, CSRF tokens |
| `005_agent_intelligence.sql` | Agent actions, agent memory, chat messages |
| `006_intake_layer.sql` | Universal intake: companies, integrations, business_events, operator_instructions; adds company_id to contacts |
| `007_command_interface.sql` | Command interface: chat sessions, command history |
| `008_proactive_autonomy.sql` | Proactive autonomy: scheduled jobs, alerts, agent workstreams |
| `009_agent_runs_created_at.sql` | Adds `created_at` to agent_runs |
| `010_intelligence_trust_fixes.sql` | Intelligence trust improvements: indexes, constraints |
| `011_entity_grounding.sql` | Entity grounding: structured business context for agents |
| `012_workspace_credentials.sql` | Per-workspace provider credentials with encrypted storage and verification state |
| `013_outputs.sql` | **Outputs table** — stores finished deliverables (morning briefings, weekly reports, collections summaries) produced by scheduled jobs |

**Migrations run automatically on startup** via `server/start.js`. All SQL files use
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so they are safe to
re-run and idempotent.

**To run migrations manually** (e.g. on a fresh database or for debugging):

```bash
node server/db/migrate.js
```

---

## Rollback Procedure

1. Revert to the previous Git commit:

   ```bash
   git checkout <previous-commit-sha>
   ```

2. Restore the database from the most recent backup taken before the deployment:

   ```bash
   ./scripts/restore.sh backups/autonome_<timestamp>.sql "$DATABASE_URL"
   ```

3. Restart the server with the reverted code.

---

## ⚠️ BYPASS_SUBSCRIPTION Warning

**`BYPASS_SUBSCRIPTION=true` must NEVER be set in production.**

When this flag is enabled:
- All Stripe subscription checks are **completely bypassed**
- Any authenticated user is treated as having an active paid subscription
- The auto-seed process creates a dev user with full workspace access
- Billing-gated features are accessible to all users without payment

Setting this to `true` in production would give all users free access to paid features and represents a critical security misconfiguration. Always confirm `BYPASS_SUBSCRIPTION=false` (or the variable is unset) before deploying.

---

## Backup & Restore

Backup scripts are located in `scripts/`. Backup files are written to the `backups/` directory (excluded from Git).

**Create a backup:**

```bash
./scripts/backup.sh "$DATABASE_URL"
# or
DATABASE_URL=postgresql://... ./scripts/backup.sh
```

**Restore from a backup:**

```bash
./scripts/restore.sh backups/autonome_20260412_120000.sql "$DATABASE_URL"
# or
DATABASE_URL=postgresql://... ./scripts/restore.sh backups/autonome_20260412_120000.sql
```

The restore script prompts for confirmation before overwriting the database.

---

## Monitoring

### `GET /api/health`

No authentication required. Returns the current health status of the server.

**Response shape:**

```json
{
  "status": "ok",
  "timestamp": "2026-04-12T23:38:11.733Z",
  "db": "ok",
  "uptime": 3600,
  "node": "v20.0.0"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `"ok"` \| `"degraded"` | `"degraded"` if the database is unreachable |
| `timestamp` | ISO 8601 string | Server time at the time of the request |
| `db` | `"ok"` \| `"error"` | Result of a `SELECT 1` ping to the database |
| `uptime` | integer (seconds) | Process uptime since last restart |
| `node` | string | Node.js version (e.g. `"v20.11.0"`) |

**Uptime monitoring:** Configure your uptime monitor (e.g. UptimeRobot, Better Uptime) to poll `GET /api/health` every 60 seconds and alert if the HTTP status is not `200` or if `status !== "ok"`.
