import { da, $$ } from "../utils.js";

export function executiveDecisions(db) {
  const decisions = [];
  const now = Date.now();
  const limits = db.cfg.riskLimits || {};

  // Finance: invoice collection
  (db.txns || [])
    .filter((t) => t.type === "inv" && t.st === "pending")
    .forEach((inv) => {
      const overdue = inv.due && new Date(inv.due) < new Date();
      const daysPast = inv.due ? da(inv.due) : 0;
      const impact = inv.amt || 0;

      if (overdue && daysPast <= 3) {
        decisions.push({
          agent: "finance",
          action: "remind",
          target: inv.id,
          targetName: inv.desc,
          priority: 90 + Math.min(impact / 100, 10),
          impact,
          desc: `Send reminder for ${$$(impact)} — ${daysPast}d overdue`,
          auto: impact <= (limits.maxAutoSpend || 500) * 10,
          needsApproval: false,
        });
      } else if (overdue && daysPast > 3 && daysPast <= 7) {
        decisions.push({
          agent: "finance",
          action: "urgent",
          target: inv.id,
          targetName: inv.desc,
          priority: 95,
          impact,
          desc: `URGENT: ${$$(impact)} is ${daysPast}d overdue — escalate`,
          auto: true,
          needsApproval: false,
        });
      } else if (overdue && daysPast > 7) {
        decisions.push({
          agent: "finance",
          action: "escalate",
          target: inv.id,
          targetName: inv.desc,
          priority: 98,
          impact,
          desc: `CRITICAL: ${$$(impact)} is ${daysPast}d overdue — collections`,
          auto: false,
          needsApproval: true,
        });
      } else if (!overdue) {
        decisions.push({
          agent: "finance",
          action: "pre",
          target: inv.id,
          targetName: inv.desc,
          priority: 40,
          impact,
          desc: `Pre-due reminder for ${$$(impact)}`,
          auto: true,
          needsApproval: false,
        });
      }
    });

  // Revenue: deal follow-up and qualification
  (db.deals || [])
    .filter((d) => d.stage !== "closed")
    .forEach((deal) => {
      const contact = (db.contacts || []).find((x) => x.id === deal.cid);
      const stale = da(deal.at);
      const expectedValue = (deal.val || 0) * (deal.prob || 0) / 100;

      if (stale >= 5) {
        decisions.push({
          agent: "revenue",
          action: "reengage",
          target: deal.id,
          targetName: contact?.name,
          priority: 85,
          impact: expectedValue,
          desc: `Re-engage ${contact?.name} — ${$$(deal.val)} deal stale ${stale}d`,
          auto: true,
          needsApproval: deal.val > (limits.approvalAbove || 5000),
          cid: deal.cid,
        });
      } else if (stale >= 3) {
        decisions.push({
          agent: "revenue",
          action: "followup",
          target: deal.id,
          targetName: contact?.name,
          priority: 70,
          impact: expectedValue,
          desc: `Follow up with ${contact?.name} — ${$$(deal.val)} at ${deal.prob}%`,
          auto: true,
          needsApproval: false,
          cid: deal.cid,
        });
      }

      if (deal.prob >= 70 && deal.stage === "negotiation") {
        decisions.push({
          agent: "revenue",
          action: "close",
          target: deal.id,
          targetName: contact?.name,
          priority: 92,
          impact: expectedValue,
          desc: `Close ${contact?.name} — ${$$(deal.val)} at ${deal.prob}% (high confidence)`,
          auto: false,
          needsApproval: true,
          cid: deal.cid,
        });
      }
    });

  // Revenue: lead qualification
  (db.contacts || [])
    .filter((c) => c.type === "lead" && !(db.deals || []).some((d) => d.cid === c.id))
    .forEach((c) => {
      decisions.push({
        agent: "revenue",
        action: "qualify",
        target: c.id,
        targetName: c.name,
        priority: 50,
        impact: 0,
        desc: `Qualify ${c.name} — no deal created yet`,
        auto: true,
        needsApproval: false,
        cid: c.id,
      });
    });

  // Operations: task escalation
  (db.tasks || [])
    .filter((t) => t.st !== "done" && t.due && new Date(t.due) < new Date())
    .forEach((t) => {
      decisions.push({
        agent: "operations",
        action: "escalate",
        target: t.id,
        targetName: t.title,
        priority: 75,
        impact: 0,
        desc: `Escalate: "${t.title}" is overdue`,
        auto: true,
        needsApproval: false,
      });
    });

  // Growth: campaign scaling
  if ((db.campaigns || []).length > 0) {
    const bestCampaign = db.campaigns.reduce((best, c) => {
      const cac = c.conv > 0 ? (c.spent || 0) / c.conv : Infinity;
      const bestCac = best.conv > 0 ? (best.spent || 0) / best.conv : Infinity;
      return cac < bestCac ? c : best;
    }, db.campaigns[0]);

    if (
      bestCampaign.conv > 0 &&
      (bestCampaign.spent || 0) < (bestCampaign.budget || 0) * 0.8
    ) {
      decisions.push({
        agent: "growth",
        action: "scale",
        target: bestCampaign.id,
        targetName: bestCampaign.name,
        priority: 55,
        impact: 0,
        desc: `Scale ${bestCampaign.name} — best CAC, budget available`,
        auto: false,
        needsApproval: true,
      });
    }
  }

  // Operations: asset reorder
  (db.assets || [])
    .filter((a) => a.rp > 0 && a.qty < a.rp)
    .forEach((a) => {
      decisions.push({
        agent: "operations",
        action: "reorder",
        target: a.id,
        targetName: a.name,
        priority: 80,
        impact: 0,
        desc: `Reorder ${a.name} — ${a.qty}/${a.rp} units`,
        auto: true,
        needsApproval: (a.val || 0) * (a.rp - a.qty) > (limits.maxAutoSpend || 500),
      });
    });

  return decisions.sort((a, b) => b.priority - a.priority);
}
