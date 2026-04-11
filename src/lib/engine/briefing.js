import { iso } from "../utils.js";
import { calcHealth } from "./health.js";
import { executiveDecisions } from "./decisions.js";

export function computeBriefing(db) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lastBriefing = db.cfg?.lastBriefing ? new Date(db.cfg.lastBriefing).getTime() : 0;

  // Revenue collected today
  const collectedToday = (db.txns || [])
    .filter((t) => t.type === "inc" && t.st === "paid" && new Date(t.paidAt || t.at).getTime() >= todayStart)
    .reduce((sum, t) => sum + (t.amt || 0), 0);

  // New leads since last briefing
  const newLeads = (db.contacts || [])
    .filter((c) => c.type === "lead" && new Date(c.createdAt).getTime() > lastBriefing)
    .length;

  // Newly overdue invoices
  const newlyOverdue = (db.txns || [])
    .filter(
      (t) =>
        t.type === "inv" &&
        t.st === "pending" &&
        t.due &&
        new Date(t.due) < new Date() &&
        new Date(t.due).getTime() > lastBriefing
    )
    .length;

  // Deals advanced
  const dealsAdvanced = (db.deals || []).filter(
    (d) => d.at && new Date(d.at).getTime() > lastBriefing && d.stage !== "closed"
  ).length;

  // Tasks auto-completed
  const tasksAuto = (db.tasks || [])
    .filter((t) => t.st === "done" && t.completedAt && new Date(t.completedAt).getTime() > lastBriefing)
    .length;

  // Workflows
  const wfs = db.workflows || [];
  const workflowsCompleted = wfs.filter(
    (w) => w.status === "completed" && w.completedAt && new Date(w.completedAt).getTime() > lastBriefing
  ).length;
  const workflowsPaused = wfs.filter(
    (w) => w.status === "paused" && w.pausedAt && new Date(w.pausedAt).getTime() > lastBriefing
  ).length;

  // Pending approvals
  const pendingApprovals = executiveDecisions(db).filter((d) => d.needsApproval && !d.auto).length;

  // Health
  const currentHealth = calcHealth(db);
  const previousHealth = db.cfg?.lastHealthScore || currentHealth;
  const healthDelta = currentHealth - previousHealth;

  return {
    generatedAt: iso(),
    collectedToday,
    newLeads,
    newlyOverdue,
    dealsAdvanced,
    tasksAuto,
    workflowsCompleted,
    workflowsPaused,
    pendingApprovals,
    healthScore: currentHealth,
    healthDelta,
  };
}
