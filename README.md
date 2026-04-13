# Autonome

AI-powered autonomous business operating platform for small and mid-sized businesses.

## Features

- **5 AI Agents**: Finance, Revenue, Operations, Growth, Support — running autonomous decision cycles
- **CRM**: Contacts, deals pipeline, invoice management
- **Task Management**: Auto-prioritized, agent-escalated tasks
- **Workflow Engine**: Automated multi-step business processes
- **Real Communications**: Email (SMTP) and SMS (Twilio) sending
- **AI Assistant**: Server-side AI proxy (Anthropic Claude)
- **Webhook Ingestion**: External lead, payment, and event intake
- **Stripe Billing**: $1,279/mo subscription with full lifecycle management
- **Multi-tenant**: Workspace isolation with role-based access
- **Password Reset**: Secure token-based password recovery flow

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Development

1. Clone and install dependencies:

```bash
git clone <repo-url>
cd autonome
npm install          # frontend
cd server && npm install   # backend
```

2. Configure environment:

```bash
cp .env.example server/.env
# Edit server/.env — set DATABASE_URL, JWT_SECRET, and any optional services
```

3. Run database migrations:

```bash
cd server
npm run migrate
```

4. Start development servers (two terminals):

```bash
# Terminal 1 — API server
cd server && npm run dev

# Terminal 2 — Vite frontend
npm run dev
```

Frontend: `http://localhost:5173`
API: `http://localhost:3001`

### Development Mode (No Stripe Required)

To access the full dashboard without configuring Stripe:

1. Add to `server/.env`:
   ```
   BYPASS_SUBSCRIPTION=true
   ```

2. Seed the database with a dev account:
   ```bash
   cd server
   npm run seed
   ```

3. Log in with:
   - **Email:** `admin@autonome.local`
   - **Password:** `autonome123!`

> **Warning:** Never enable `BYPASS_SUBSCRIPTION` in production.

### Docker

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env — set JWT_SECRET, DB_PASSWORD, and any optional services

docker-compose up --build
```

App will be available at `http://localhost:3001`.

### Production Deployment (Render / Railway / Heroku)

1. Set the environment variables listed below on your platform.
2. Build command: `npm ci && npm run build`
3. Start command: `cd server && npm ci --production && node index.js`
4. Or use the included `Procfile` (Heroku / Railway auto-detect).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs (use a long random string) |
| `JWT_EXPIRES_IN` | No | JWT expiry (default: `7d`) |
| `PORT` | No | Server port (default: `3001`) |
| `NODE_ENV` | No | Set to `production` to serve the frontend build |
| `CLIENT_URL` | No | Frontend URL for CORS and links (default: `http://localhost:5173`) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Yes | Stripe price ID for the $1,279/mo plan |
| `SMTP_HOST` | No | SMTP server host (email sending) |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | Sender address (default: `noreply@autonome.app`) |
| `TWILIO_ACCOUNT_SID` | No | Twilio account SID (SMS sending) |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | No | Twilio outbound phone number |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for Claude AI assistant |
| `AI_MODEL` | No | Claude model (default: `claude-sonnet-4-20250514`) |
| `BYPASS_SUBSCRIPTION` | No | Set to `true` to skip Stripe subscription checks (dev only) |

## API Reference

All endpoints are prefixed with `/api`.

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/forgot-password` | Request password reset link |
| `POST` | `/api/auth/reset-password` | Reset password with token |

### Workspaces
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/workspaces` | Create workspace |
| `GET` | `/api/workspaces/:id` | Get workspace |
| `PATCH` | `/api/workspaces/:id` | Update workspace |
| `POST` | `/api/workspaces/:id/complete-onboarding` | Finalize onboarding |

### Billing
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/billing/create-checkout-session` | Start Stripe checkout |
| `POST` | `/api/billing/webhook` | Stripe webhook handler |
| `GET` | `/api/billing/status` | Get subscription status |
| `POST` | `/api/billing/create-portal-session` | Open billing portal |

### CRM & Operations
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/contacts` | List / create contacts |
| `GET/PATCH/DELETE` | `/api/contacts/:id` | Get / update / delete contact |
| `GET/POST` | `/api/deals` | List / create deals |
| `GET/POST` | `/api/invoices` | List / create invoices |
| `GET/POST` | `/api/tasks` | List / create tasks |
| `GET/POST` | `/api/workflows` | List / create workflows |
| `GET` | `/api/audit-log` | List audit entries |
| `GET` | `/api/communications` | List communications |

### Agent & Metrics
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agent/decisions` | List pending agent decisions |
| `POST` | `/api/agent/execute` | Trigger agent cycle |
| `POST` | `/api/agent/approve` | Approve a decision |
| `POST` | `/api/agent/reject` | Reject a decision |
| `GET` | `/api/metrics/summary` | Business metrics summary |
| `GET` | `/api/metrics/roi` | ROI calculations |

### AI & Webhooks
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/query` | Query AI assistant (server-side proxy) |
| `POST` | `/api/webhooks/lead` | Ingest a lead (API-key auth) |
| `POST` | `/api/webhooks/payment` | Ingest a payment event (API-key auth) |
| `POST` | `/api/webhooks/event` | Ingest a generic event (API-key auth) |
| `POST` | `/api/webhooks/generate-key` | Generate webhook API key |
| `GET` | `/api/webhooks/key` | Get current webhook API key |
| `GET` | `/api/settings/integrations` | Integration status |

### Companies
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/companies` | List companies for workspace |
| `POST` | `/api/companies` | Create company |
| `GET` | `/api/companies/:id` | Get company with linked contacts, deals, invoices |
| `PATCH` | `/api/companies/:id` | Update company |
| `DELETE` | `/api/companies/:id` | Delete company |
| `POST` | `/api/companies/:id/link-contact` | Link a contact to a company |

### Integrations
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/integrations` | List integrations for workspace |
| `POST` | `/api/integrations` | Create integration (`type`, `name`, `config`) |
| `PATCH` | `/api/integrations/:id` | Update integration status/config/name |
| `DELETE` | `/api/integrations/:id` | Remove integration |
| `POST` | `/api/integrations/:id/test` | Test integration connection |

Supported `type` values: `gmail`, `outlook`, `twilio`, `stripe`, `webhook`, `form`, `calendar`, `csv_import`.

### Business Events
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/business-events` | List events (paginated, filterable by `source`, `event_type`, `status`, `owner_agent`, `from`/`to` date) |
| `GET` | `/api/business-events/stats` | Aggregate stats by source, status, agent, type |
| `GET` | `/api/business-events/:id` | Get single event with full pipeline details |
| `POST` | `/api/business-events/:id/reprocess` | Re-run the intake pipeline on an event |

### Intake (Ingest Endpoints)
All ingest endpoints accept authenticated requests (session cookie/JWT) or an `x-api-key` header matching an active integration's `config.api_key`.

| Method | Path | Required Fields | Description |
|---|---|---|---|
| `POST` | `/api/ingest/email` | `from`, `subject` | Ingest an inbound email |
| `POST` | `/api/ingest/form` | `form_type`, `fields` | Ingest a form submission |
| `POST` | `/api/ingest/call` | `caller_phone` | Ingest a phone call event |
| `POST` | `/api/ingest/sms` | `from`, `body` | Ingest an SMS message |
| `POST` | `/api/ingest/payment` | `amount`, `currency`, `status`, `provider` | Ingest a payment event |
| `POST` | `/api/ingest/support` | `subject`, `body` | Ingest a support request |
| `POST` | `/api/ingest/calendar` | `title`, `start` | Ingest a calendar/booking event |
| `POST` | `/api/ingest/document` | `type`, `name` | Ingest a document |
| `POST` | `/api/ingest/webhook` | `source`, `event_type`, `payload` | Generic webhook ingestion |

Each ingest endpoint runs the full 4-stage pipeline (classify → identify entities → route to agents → resolve) and returns the processed event including `classified_data`, `entity_links`, `agent_routing`, and `resolution`.

### Operator Instructions
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/operator-instructions` | List active instructions (filterable by `agent`, `type`) |
| `POST` | `/api/operator-instructions` | Create instruction (`instruction`, `agent?`, `type`, `priority`) |
| `PATCH` | `/api/operator-instructions/:id` | Update instruction |
| `DELETE` | `/api/operator-instructions/:id` | Soft-delete (sets `active=false`) |

Supported `type` values: `preference`, `policy`, `rule`, `override`.

## Architecture

```
autonome/
├── src/               # React 18 frontend (Vite)
│   ├── pages/         # Auth, onboarding, billing pages
│   ├── views/         # Main app views (CRM, agents, ROI, etc.)
│   ├── contexts/      # AuthContext
│   └── lib/           # API client, theme, storage helpers
├── server/            # Node.js + Express API
│   ├── routes/        # REST endpoints
│   ├── middleware/     # JWT auth, workspace, subscription guards
│   ├── engine/        # Agent decision engine, scheduler, intake pipeline
│   ├── services/      # Email (SMTP) and SMS (Twilio)
│   ├── db/            # PostgreSQL pool + migrations
│   └── __tests__/     # Vitest unit tests
├── Dockerfile         # Multi-stage production build
├── docker-compose.yml # Local stack (app + PostgreSQL)
└── Procfile           # Heroku / Railway deployment
```

## Intake Pipeline Architecture

Every inbound business event (email, form, call, payment, webhook, etc.) flows through a 4-stage pipeline defined in `server/engine/intake.js`:

```
Ingest → [Stage 1: Classify] → [Stage 2: Identify Entities] → [Stage 3: Route to Agents] → [Stage 4: Resolve] → Update business_events
```

### Stage 1: Classification
Assigns `category`, `urgency` (critical/high/medium/low), `sentiment` (positive/neutral/negative), and a human-readable `summary` based on `event_type` and `raw_data` keywords.

### Stage 2: Entity Identification
Searches contacts (by email/phone), companies (by domain), deals, invoices, and workflows to build an `entity_links` array — each entry has `entity_type`, `entity_id`, `relationship`, and `confidence`.

### Stage 3: Agent Routing
Maps the event to one or more agents based on content and entity links. Returns `agent_routing` (with `primary`, `informed`, and `coordinator` roles) and `owner_agent`.

| Event Type | Primary Agent | Logic |
|---|---|---|
| `payment_received` / `payment_failed` | `finance` | Always; `revenue` informed if open deal |
| `inbound_email` | `finance` / `revenue` / `support` | Detected from subject/body keywords |
| `form_submission` / `new_lead` | `revenue` or `support` | Based on form type |
| `missed_call` | `revenue` / `support` / `operations` | Based on entity links |
| `support_request` / `complaint` | `support` | Always; others informed |
| `review` | `support` | Always; `growth` informed |
| `booking_request` / `schedule_event` | `operations` | Always |

### Stage 4: Resolution
Decides what to do automatically (e.g., mark invoice paid on payment received, create contact on new lead) and checks `operator_instructions` for any applicable policies. Sets `requires_approval` if a policy applies. Returns a `resolution` object with `action_taken`, `auto_acted`, and `notes`.

### Idempotency
Reprocessing an event (via `POST /api/business-events/:id/reprocess`) resets status to `pending` and re-runs all stages. Auto-actions use `ON CONFLICT DO NOTHING` or conditional updates to prevent duplicates.

## Stripe Setup

1. Create a product in the Stripe Dashboard: **Autonome Pro** at **$1,279/month**
2. Copy the Price ID (e.g. `price_xxx`) into `server/.env` as `STRIPE_PRICE_ID`
3. Set up a webhook endpoint pointing to `https://your-domain.com/api/billing/webhook`
4. Copy the Webhook signing secret into `server/.env` as `STRIPE_WEBHOOK_SECRET`

For local development, use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

## Running Tests

```bash
cd server
npm test
```

