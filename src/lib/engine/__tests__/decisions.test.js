import { describe, it, expect } from "vitest";
import { executiveDecisions } from "../decisions.js";

function makeDb(overrides = {}) {
  return {
    cfg: { riskLimits: { maxAutoSpend: 500, approvalAbove: 5000, dailyEmailLimit: 50 } },
    txns: [],
    deals: [],
    contacts: [],
    tasks: [],
    assets: [],
    campaigns: [],
    workflows: [],
    ...overrides,
  };
}

describe("executiveDecisions()", () => {
  it("returns empty array for empty db", () => {
    const db = makeDb();
    expect(executiveDecisions(db)).toEqual([]);
  });

  it("returns finance remind decision for overdue invoice (1-3 days)", () => {
    const dueDate = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
    const db = makeDb({
      txns: [{ id: "inv1", type: "inv", st: "pending", amt: 1000, desc: "Invoice A", due: dueDate }],
    });
    const decisions = executiveDecisions(db);
    const remindDecision = decisions.find((d) => d.agent === "finance" && d.action === "remind");
    expect(remindDecision).toBeDefined();
    expect(remindDecision.target).toBe("inv1");
    expect(remindDecision.impact).toBe(1000);
  });

  it("returns finance urgent decision for invoice overdue 4-7 days", () => {
    const dueDate = new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0];
    const db = makeDb({
      txns: [{ id: "inv2", type: "inv", st: "pending", amt: 2000, desc: "Invoice B", due: dueDate }],
    });
    const decisions = executiveDecisions(db);
    const urgentDecision = decisions.find((d) => d.agent === "finance" && d.action === "urgent");
    expect(urgentDecision).toBeDefined();
    expect(urgentDecision.target).toBe("inv2");
  });

  it("returns revenue followup decisions for stale deals", () => {
    const staleDeal = {
      id: "deal1",
      cid: "c1",
      val: 3000,
      prob: 50,
      stage: "proposal",
      at: new Date(Date.now() - 4 * 86400000).toISOString(),
    };
    const db = makeDb({
      deals: [staleDeal],
      contacts: [{ id: "c1", name: "Alice", type: "customer" }],
    });
    const decisions = executiveDecisions(db);
    const followup = decisions.find((d) => d.agent === "revenue" && d.action === "followup");
    expect(followup).toBeDefined();
    expect(followup.target).toBe("deal1");
  });

  it("returns qualify decisions for leads without deals", () => {
    const db = makeDb({
      contacts: [{ id: "lead1", name: "Bob", type: "lead" }],
      deals: [],
    });
    const decisions = executiveDecisions(db);
    const qualify = decisions.find((d) => d.agent === "revenue" && d.action === "qualify");
    expect(qualify).toBeDefined();
    expect(qualify.target).toBe("lead1");
  });

  it("respects approval limits — large deal requires approval", () => {
    const staleDeal = {
      id: "deal2",
      cid: "c2",
      val: 10000,
      prob: 80,
      stage: "negotiation",
      at: new Date(Date.now() - 6 * 86400000).toISOString(),
    };
    const db = makeDb({
      deals: [staleDeal],
      contacts: [{ id: "c2", name: "Carol", type: "customer" }],
      cfg: { riskLimits: { maxAutoSpend: 500, approvalAbove: 5000, dailyEmailLimit: 50 } },
    });
    const decisions = executiveDecisions(db);
    const closeDec = decisions.find((d) => d.agent === "revenue" && d.action === "close");
    expect(closeDec).toBeDefined();
    expect(closeDec.needsApproval).toBe(true);
  });
});
