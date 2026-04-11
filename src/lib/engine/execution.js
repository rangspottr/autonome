import { uid, iso } from "../utils.js";
import { startWorkflow } from "./workflows.js";

const AGENT_LABELS = {
  finance: "Finance",
  revenue: "Revenue",
  operations: "Operations",
  growth: "Growth",
  support: "Support",
};

export async function executeAction(db, decision, options = {}) {
  const newDb = JSON.parse(JSON.stringify(db));
  const { agent, action, target, cid } = decision;
  const now = iso();
  const limits = newDb.cfg.riskLimits || {};
  let description = decision.desc || `${agent}:${action}`;
  let delivered = false;
  let workflowStarted = null;

  // Finance actions
  if (agent === "finance") {
    const inv = (newDb.txns || []).find((t) => t.id === target);
    if (inv) {
      if (action === "remind" || action === "pre") {
        const wf = startWorkflow(newDb, "invoice_collection", inv.id, null);
        if (wf) { newDb.workflows = [...(newDb.workflows || []), wf]; workflowStarted = wf.id; }
        newDb.outcomes.emailsSent = (newDb.outcomes.emailsSent || 0) + 1;
        newDb.sent = [...(newDb.sent || []), { id: uid(), type: "email", subject: description, to: inv.email || "client", at: now, delivered: false, simulated: true }];
        description = `Sent ${action === "pre" ? "pre-due" : "overdue"} reminder for invoice: ${inv.desc}`;
      } else if (action === "urgent") {
        newDb.outcomes.emailsSent = (newDb.outcomes.emailsSent || 0) + 1;
        newDb.sent = [...(newDb.sent || []), { id: uid(), type: "email", subject: `URGENT: ${inv.desc}`, to: inv.email || "client", at: now, delivered: false, simulated: true }];
        description = `Sent urgent payment notice for: ${inv.desc}`;
      } else if (action === "escalate") {
        description = `Escalated to collections: ${inv.desc} (${inv.amt})`;
        inv.st = "escalated";
      } else if (action === "mark_paid") {
        inv.st = "paid";
        newDb.outcomes.collected = (newDb.outcomes.collected || 0) + (inv.amt || 0);
        description = `Marked invoice paid: ${inv.desc}`;
        // Mark any active invoice_collection workflow as completed with payment
        (newDb.workflows || []).forEach((wf) => {
          if (wf.targetId === inv.id && wf.status === "active") {
            wf.status = "completed";
            wf.completedAt = now;
            wf.outcome = "payment_received";
          }
        });
      }
    }
  }

  // Revenue actions
  if (agent === "revenue") {
    const deal = (newDb.deals || []).find((d) => d.id === target);
    const contact = cid ? (newDb.contacts || []).find((c) => c.id === cid) : null;

    if (action === "qualify" && contact) {
      contact.type = "qualified";
      newDb.outcomes.leadsQualified = (newDb.outcomes.leadsQualified || 0) + 1;
      description = `Qualified lead: ${contact.name}`;
    } else if (action === "followup" && deal) {
      const wf = startWorkflow(newDb, "deal_followup", deal.id, deal.cid);
      if (wf) { newDb.workflows = [...(newDb.workflows || []), wf]; workflowStarted = wf.id; }
      deal.at = now;
      newDb.outcomes.dealsProgressed = (newDb.outcomes.dealsProgressed || 0) + 1;
      newDb.outcomes.emailsSent = (newDb.outcomes.emailsSent || 0) + 1;
      description = `Sent follow-up for deal with ${contact?.name || "contact"}`;
    } else if (action === "reengage" && deal) {
      deal.at = now;
      newDb.outcomes.emailsSent = (newDb.outcomes.emailsSent || 0) + 1;
      description = `Re-engaged ${contact?.name || "contact"}`;
    } else if (action === "close" && deal) {
      deal.stage = "closed";
      deal.closedAt = now;
      newDb.outcomes.dealsClosed = (newDb.outcomes.dealsClosed || 0) + 1;
      newDb.outcomes.collected = (newDb.outcomes.collected || 0) + (deal.val || 0);
      description = `Closed deal with ${contact?.name || "contact"}: ${deal.val}`;
    }
  }

  // Operations actions
  if (agent === "operations") {
    const task = (newDb.tasks || []).find((t) => t.id === target);
    const asset = (newDb.assets || []).find((a) => a.id === target);

    if (action === "escalate" && task) {
      task.priority = "high";
      task.escalatedAt = now;
      const wf = startWorkflow(newDb, "task_escalation", task.id, null);
      if (wf) { newDb.workflows = [...(newDb.workflows || []), wf]; workflowStarted = wf.id; }
      newDb.outcomes.tasksAuto = (newDb.outcomes.tasksAuto || 0) + 1;
      description = `Escalated task: ${task.title}`;
    } else if (action === "reorder" && asset) {
      asset.reorderedAt = now;
      description = `Initiated reorder for ${asset.name}`;
    }
  }

  // Growth actions
  if (agent === "growth") {
    const campaign = (newDb.campaigns || []).find((c) => c.id === target);
    if (action === "scale" && campaign) {
      campaign.budget = (campaign.budget || 0) * 1.25;
      description = `Scaled budget for campaign: ${campaign.name}`;
    }
  }

  // Audit trail
  newDb.audit = [
    ...(newDb.audit || []),
    {
      id: uid(),
      at: now,
      agent: AGENT_LABELS[agent] || agent,
      action,
      target,
      desc: description,
      auto: decision.auto || false,
      delivered,
      workflowStarted,
      approvedBy: options.approvedBy || null,
    },
  ];

  // Memory entry
  if (cid) {
    newDb.memory = [
      ...(newDb.memory || []),
      {
        id: uid(),
        at: now,
        contactId: cid,
        type: "action",
        text: description,
        agent,
        tags: [action, agent],
        sentiment: "neutral",
        source: "autonome",
        linkedEntityId: target,
        linkedEntityType: agent === "revenue" ? "deal" : agent === "finance" ? "invoice" : "task",
      },
    ];
  }

  return newDb;
}
