# Autonome

The AI-powered autonomous operations platform for modern businesses.

## Tech Stack

**Frontend**
- React 18 + Vite 5
- react-router-dom
- Plus Jakarta Sans

**Backend**
- Node.js + Express
- PostgreSQL (via pg)
- JWT authentication
- Stripe billing
- bcrypt, helmet, cors, dotenv

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- A Stripe account

---

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd autonome
```

### 2. Backend setup

```bash
cd server
npm install
```

Create `server/.env` (copy from `.env.example`):

```bash
cp ../.env.example server/.env
# Edit server/.env with your DATABASE_URL, JWT_SECRET, and Stripe keys
```

Run database migrations:

```bash
npm run migrate
```

Start the server:

```bash
npm run dev
```

The API will be running at `http://localhost:3001`.

### 3. Frontend setup

```bash
cd ..   # back to repo root
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Stripe setup

1. Create a product in Stripe Dashboard: **Autonome Pro** at **$1,279/month**
2. Copy the **Price ID** (e.g. `price_xxx`) into `server/.env` as `STRIPE_PRICE_ID`
3. Set up a webhook endpoint pointing to `https://your-domain.com/api/billing/webhook`
4. Copy the **Webhook signing secret** into `server/.env` as `STRIPE_WEBHOOK_SECRET`

For local development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

---

## User Flow

1. Sign up at `/signup`
2. Create workspace at `/create-workspace`
3. Complete company details at `/onboarding`
4. Subscribe at `/checkout` (redirects to Stripe)
5. After payment, redirected to the app at `/`

---

## API

All API endpoints are prefixed with `/api`.

- `GET /api/health` — Health check
- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Sign in
- `GET /api/auth/me` — Get current user
- `POST /api/workspaces` — Create workspace
- `GET /api/workspaces/:id` — Get workspace
- `PATCH /api/workspaces/:id` — Update workspace
- `POST /api/workspaces/:id/complete-onboarding` — Complete onboarding
- `POST /api/billing/create-checkout-session` — Start Stripe checkout
- `POST /api/billing/webhook` — Stripe webhook handler
- `GET /api/billing/status` — Get subscription status
- `POST /api/billing/create-portal-session` — Open Stripe billing portal
- `GET /api/contacts` — List contacts
- `POST /api/contacts` — Create contact
- `GET /api/deals` — List deals
- `POST /api/deals` — Create deal
- `GET /api/invoices` — List invoices
- `POST /api/invoices` — Create invoice
- `GET /api/tasks` — List tasks
- `POST /api/tasks` — Create task
- `GET /api/workflows` — List workflows
- `GET /api/audit-log` — List audit entries
- `GET /api/communications` — List communications
- `GET /api/agent-runs` — List agent runs
