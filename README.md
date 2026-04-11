# Autonome v12

**AI-powered business operating layer for small and mid-sized businesses.**

Autonome acts as an autonomous operator — recovering revenue, following up leads, managing workflows, surfacing priorities, and reducing admin burden. It moves your business from passive information storage to active execution.

---

## Tech Stack

- **React 18** — UI framework
- **Vite 5** — Build tool and dev server
- **Plus Jakarta Sans** — Typography
- **window.storage** — Pluggable persistence layer
- **Anthropic Claude** (optional) — AI extraction and queries

---

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` to use the app.

For the landing page, open `http://localhost:5173/landing.html`.

---

## Architecture Overview

### Engine (`src/lib/engine/`)

| File | Purpose |
|------|---------|
| `decisions.js` | `executiveDecisions()` — scores and ranks all pending business actions |
| `workflows.js` | Multi-step automated workflow engine with 5 templates |
| `execution.js` | `executeAction()` — shared execution function for all agents |
| `roi.js` | `calcROI()` — tracks hours saved, money saved, headcount equivalent |
| `health.js` | `calcHealth()` — 0–100 business health score |
| `briefing.js` | `computeBriefing()` — daily summary computation |

### Components (`src/components/`)

Reusable UI primitives: `Card`, `Stat`, `Pill`, `Button`, `Bar`, `Input`, `Select`, `Row`, `Dialog`, `Section`, `ErrorBoundary`, `AgentMeta`.

All components use the `T` theme object from `src/lib/theme.js`.

### Views (`src/views/`)

| View | Description |
|------|-------------|
| `Setup.jsx` | 6-step onboarding with industry defaults |
| `CmdCenter.jsx` | Today's priorities, daily briefing, missed call capture |
| `AgentView.jsx` | Agent status, cycle runner, active workflows |
| `ApprovalView.jsx` | Pending high-value action approvals |
| `FinanceView.jsx` | Invoices, income, expenses, mark-paid |
| `SalesView.jsx` | Contacts, deals, pipeline kanban, contact timeline |
| `OpsView.jsx` | Task management with priority and status |
| `InventoryView.jsx` | Asset inventory with reorder alerts |
| `ROIView.jsx` | ROI metrics, health score, workflow outcomes |
| `ProcessView.jsx` | Text-to-action parser (AI + rule-based fallback) |
| `KnowledgeView.jsx` | CRUD knowledge base with category filtering |
| `AuditView.jsx` | Full audit trail of all agent actions |
| `SettingsView.jsx` | API keys, risk limits, activation checklist |

---

## Agents

| Agent | Icon | Responsibilities |
|-------|------|-----------------|
| Finance | 💰 | Invoice collection, payment reminders, escalation to collections |
| Revenue | 📈 | Lead qualification, deal follow-up, close high-probability deals |
| Operations | ⚙️ | Task escalation, inventory reordering |
| Growth | 🚀 | Campaign scaling based on CAC analysis |
| Support | 🎧 | Issue acknowledgment and escalation |

---

## Key Features

- **Command Center** — Prioritized action list in 4 urgency tiers (Money at Risk, Revenue Opportunities, Operational Health, Optimization)
- **Revenue Impact Header** — Live metrics: revenue at risk, pipeline requiring action, recovered, pending approvals
- **Daily Briefing** — Collapsible summary of what happened since last session
- **Missed Call Capture** — Log → creates lead + task + workflow + memory entry
- **Multi-step Onboarding** — 6 steps with industry-specific defaults (roofing, HVAC, plumbing, solar, construction, agency, ecommerce, SaaS, services)
- **Process View** — Paste any text, extract contacts/intents/sentiment via AI or rule-based parser
- **Knowledge Base** — Articles included as AI query context; categories: Policies, Pricing, Objection Handling, Troubleshooting, SOPs, Product Info
- **Enhanced Memory** — tags[], sentiment, source, linkedEntityId/Type; Contact Timeline view
- **Workflow Engine** — 5 templates: invoice_collection, deal_followup, task_escalation, issue_resolution, campaign_optimization
- **Activation Checklist** — Setup completion status in Settings
- **ErrorBoundary** — Each view wrapped independently

---

## Risk & Approval Controls

All agent actions respect configurable limits:

- `maxAutoSpend` — auto-execute below this threshold
- `approvalAbove` — always require human approval above this amount
- `refundThreshold` — flag refunds for review
- `dailyEmailLimit` — cap automated outbound emails

---

## Data Model

All data stored in `BLANK` structure via `window.storage`:

```
cfg, contacts[], txns[], tasks[], assets[], events[], deals[],
campaigns[], agentQueue[], memory[], audit[], outcomes{},
workflows[], knowledge[], log[], sent[]
```
