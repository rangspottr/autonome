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
│   ├── engine/        # Agent decision engine + scheduler
│   ├── services/      # Email (SMTP) and SMS (Twilio)
│   ├── db/            # PostgreSQL pool + migrations
│   └── __tests__/     # Vitest unit tests
├── Dockerfile         # Multi-stage production build
├── docker-compose.yml # Local stack (app + PostgreSQL)
└── Procfile           # Heroku / Railway deployment
```

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

