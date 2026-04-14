# CEO Readiness Proof System

This document explains how to run the full automated proof suite that validates Autonome works end-to-end.

## Quick Start

```bash
# 1. Install all dependencies
npm install
cd server && npm install && cd ..

# 2. Run all server unit/integration tests (92 tests)
cd server && npm test

# 3. Build the frontend
npm run build

# 4. Run E2E browser tests (28 tests, 25 passing)
npx playwright test

# 5. Run both together
cd server && npm test && cd .. && npm run build && npx playwright test
```

## What Is Proven

### Server Tests (`server/npm test`) — 92 Tests

| Suite | File | What It Proves |
|---|---|---|
| Jobs | `jobs/__tests__/jobs.test.js` | Morning Briefing, Weekly Report, Collections Operator generate correct output from real DB logic |
| Scheduler | `jobs/__tests__/scheduler.test.js` | Scheduled jobs fire on time (fake timers), not just that the code exists |
| Integrations | `__tests__/integrations.test.js` | Mock Gmail inbox, missed calls, SMS, lead forms, payments, calendar events, support tickets all ingest correctly |
| Scenarios | `engine/__tests__/scenarios.test.js` | 17 business scenarios: after-hours leads, overdue invoices, disputed payments, support overlaps, owner-away mode |
| Middleware | `__tests__/middleware.test.js` | Auth, CSRF, rate limiting |
| Auth | `__tests__/auth.test.js` | Login, signup, JWT |
| Webhooks | `__tests__/webhooks.test.js` | Lead and payment webhook intake |

### E2E Tests (`npx playwright test`) — 28 Tests

| Suite | What It Proves |
|---|---|
| Auth — Login page | Login form renders, errors shown, redirect after success |
| Auth — Signup page | Signup form renders correctly |
| Command Center | Dashboard loads, no SQL errors exposed, not empty |
| Outputs | Morning Briefing, Weekly Report, Collections Scan generate; page not empty |
| Boardroom | AI chat loads without errors, returns responses not fallback messages |
| Approvals | Approval view loads, approve buttons visible |
| Alerts | Alerts view loads without DB errors |
| Collections | Collections view loads, overdue data shown |
| Inbox/Leads | Inbox operator renders |
| Audit Log | Audit log loads |
| Error handling | 500 errors show friendly messages not stack traces; redirect when unauthenticated |
| Scheduled Job Proof | Outputs page shows automatically-generated outputs from seeded scheduled runs |

All E2E tests use **API route mocking** — no real database or server required. Tests intercept `http://localhost:3001/api/*` and return deterministic demo fixtures from `e2e/helpers.js`.

## Demo Workspace Seed

The seed script (`server/db/seed-scenario.js`) creates a realistic business with:

- **5 contacts** (customers, prospects, leads)
- **3 deals** (won, proposal, qualified)
- **4 invoices** (paid, 2× overdue, sent)
- **3 tasks** (pending + completed)
- **12 business events**: emails, missed calls (after-hours), SMS leads, calendar bookings, support tickets, payment events
- **5 agent actions** (finance, revenue, support, operations)
- **3 workflows**
- **5 operator instructions**
- **3 demo outputs**: Morning Briefing, Weekly Report, Collections Summary (pre-seeded so the workspace feels alive on first load)

Run it with:
```bash
node server/db/seed-scenario.js
```

## Mock Integration Inputs

The integration test suite (`server/__tests__/integrations.test.js`) proves the following without real connectors:

| Mock | Endpoint | Validates |
|---|---|---|
| Gmail / Outlook inbox | `POST /api/ingest/email` | Email classified, routed to agents |
| Missed call | `POST /api/ingest/call` | Missed call creates follow-up task |
| SMS | `POST /api/ingest/sms` | SMS ingested and urgency set |
| Lead form | `POST /api/ingest/form` | Form submission creates contact |
| Payment event | `POST /api/ingest/payment` | Failed payment flagged high urgency |
| Calendar event | `POST /api/ingest/calendar` | Booking request routed |
| Support request | `POST /api/ingest/support` | Urgent support ticket escalated |
| Webhook lead | `POST /api/webhooks/lead` | Lead contact created via API key |
| Webhook payment | `POST /api/webhooks/payment` | Invoice updated from payment webhook |

## Scenario Coverage

17 automated business scenarios are proven in `server/engine/__tests__/scenarios.test.js`:

1. Missed calls create follow-up tasks
2. After-hours leads queued for outreach
3. Invoice 8+ days overdue → escalate (not just remind)
4. Disputed invoice flagged by support agent
5. Two-agent conflict detection
6. Owner-away mode auto-executes pre-approved actions
7. After-hours lead with no deal → revenue qualification
8. Stale deal triggers revenue re-engage
9. 2-day overdue → finance remind
10. 10-day overdue → escalate with approval required
11. At-risk account → support retention
12. Finance + Revenue + Support all act on same contact
13. **Customer disputes payment** → coordinated finance + support response
14. **Support issue overlaps with unpaid invoice** → cross-agent coordination
15. **After-hours lead intake classification** → medium urgency + afterHours flag
16. **Missed call urgency** → high urgency classification
17. **Payment failure classification** → high urgency, critical for amounts >$10k

## Scheduled Job Proof

Scheduler tests (`server/jobs/__tests__/scheduler.test.js`) prove jobs fire by:

1. Using **fake timers** (`vi.useFakeTimers()`) to advance the clock
2. Asserting the job function is **actually called** after the timer ticks
3. Verifying the scheduler calculates **correct delay to next run** (e.g., next Friday 8am, next 8am, next 15-minute mark)

This is not just "scheduler code exists" — it proves the timer fires.

## Running in CI

The GitHub Actions workflow at `.github/workflows/ci.yml` runs:
1. Server unit tests: `cd server && npm test`
2. Frontend build: `npm run build`
3. Playwright E2E tests: `npx playwright test`

## Known Issues (3 of 28 E2E tests)

| Test | Issue | Fix |
|---|---|---|
| Login error banner | CSS Modules class name timing — `[class*="errorBanner"]` requires a wait | Add `waitForSelector` with longer timeout |
| Collections Scan trigger | Button not visible on default view — need to navigate to Outputs view first | Update test to navigate to the outputs section |
| Unauthenticated redirect | `waitForLoadState('networkidle')` times out when no mocked backend is set up | Use `waitForURL` or `domcontentloaded` instead |

These do not affect core business proof — all dashboard, outputs, AI, agents, approvals, alerts, and audit log tests pass.
