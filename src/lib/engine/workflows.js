import { uid, iso } from "../utils.js";

export const WF_TEMPLATES = {
  invoice_collection: {
    agent: "finance",
    steps: [
      { day: 0, action: "remind", subject: "Invoice reminder", tone: "professional" },
      { day: 3, action: "followup", subject: "Follow-up: payment outstanding", tone: "firm" },
      { day: 5, action: "urgent", subject: "Urgent: payment required", tone: "urgent" },
      { day: 7, action: "escalate", subject: "Final notice before collections", tone: "final" },
    ],
  },
  deal_followup: {
    agent: "revenue",
    steps: [
      { day: 0, action: "followup", subject: "Following up", tone: "friendly" },
      { day: 3, action: "followup", subject: "Checking in", tone: "persistent" },
      { day: 7, action: "reengage", subject: "Still interested?", tone: "direct" },
    ],
  },
  task_escalation: {
    agent: "operations",
    steps: [
      { day: 0, action: "escalate", subject: "Task overdue — priority raised", tone: "alert" },
      { day: 2, action: "escalate", subject: "Task still overdue — escalating", tone: "urgent" },
      { day: 5, action: "escalate", subject: "Critical: unresolved task", tone: "critical" },
    ],
  },
  issue_resolution: {
    agent: "support",
    steps: [
      { day: 0, action: "followup", subject: "We received your request", tone: "acknowledgment" },
      { day: 1, action: "followup", subject: "Update on your request", tone: "progress" },
      { day: 3, action: "escalate", subject: "Escalating your request", tone: "escalation" },
    ],
  },
  campaign_optimization: {
    agent: "growth",
    steps: [
      { day: 0, action: "scale", subject: "Campaign review initiated", tone: "analytical" },
      { day: 7, action: "scale", subject: "Performance checkpoint", tone: "review" },
      { day: 14, action: "scale", subject: "Budget reallocation recommendation", tone: "strategic" },
    ],
  },
};

export function startWorkflow(db, type, targetId, contactId) {
  const template = WF_TEMPLATES[type];
  if (!template) return null;

  const existingWorkflows = db.workflows || [];

  // Reject if active
  if (existingWorkflows.some((w) => w.type === type && w.targetId === targetId && w.status === "active")) {
    return null;
  }

  // Reject if completed within last 7 days
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  if (
    existingWorkflows.some(
      (w) =>
        w.type === type &&
        w.targetId === targetId &&
        w.status === "completed" &&
        w.completedAt &&
        new Date(w.completedAt).getTime() > sevenDaysAgo
    )
  ) {
    return null;
  }

  return {
    id: uid(),
    type,
    targetId,
    contactId,
    agent: template.agent,
    steps: template.steps.map((s) => ({ ...s, executed: false })),
    currentStep: 0,
    status: "active",
    startedAt: iso(),
    lastActionAt: null,
    completedAt: null,
    outcome: null,
  };
}

export function advanceWorkflows(db) {
  const now = Date.now();
  const workflows = JSON.parse(JSON.stringify(db.workflows || []));
  const actions = [];

  workflows.forEach((wf) => {
    if (wf.status !== "active") return;

    const step = wf.steps[wf.currentStep];
    if (!step) {
      wf.status = "completed";
      wf.completedAt = iso();
      wf.outcome = "exhausted";
      return;
    }

    if (step.executed) {
      wf.currentStep++;
      return;
    }

    // Check for recent reply from contact
    const cid = wf.contactId;
    if (cid) {
      const recentReply = (db.memory || []).find(
        (m) =>
          m.contactId === cid &&
          m.type === "reply" &&
          now - new Date(m.at).getTime() < 2 * 86400000
      );
      if (recentReply) {
        wf.status = "paused";
        wf.pauseReason = "Contact responded";
        return;
      }
    }

    const daysSinceStart = Math.floor(
      (now - new Date(wf.startedAt).getTime()) / 86400000
    );

    if (daysSinceStart >= step.day) {
      actions.push({
        wfId: wf.id,
        stepIdx: wf.currentStep,
        ...step,
        targetId: wf.targetId,
        contactId: wf.contactId,
        agent: wf.agent,
      });
      step.executed = true;
      wf.lastActionAt = iso();
      wf.currentStep++;
      if (wf.currentStep >= wf.steps.length) {
        wf.status = "completed";
        wf.completedAt = iso();
        wf.outcome = "exhausted";
      }
    }
  });

  return { workflows, actions };
}
