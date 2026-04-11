import { describe, it, expect } from "vitest";
import { startWorkflow, advanceWorkflows } from "../workflows.js";

function makeDb(overrides = {}) {
  return {
    workflows: [],
    memory: [],
    contacts: [],
    ...overrides,
  };
}

describe("startWorkflow()", () => {
  it("creates a workflow from a valid template", () => {
    const db = makeDb();
    const wf = startWorkflow(db, "invoice_collection", "inv1", "c1");
    expect(wf).not.toBeNull();
    expect(wf.type).toBe("invoice_collection");
    expect(wf.targetId).toBe("inv1");
    expect(wf.contactId).toBe("c1");
    expect(wf.status).toBe("active");
    expect(wf.steps.length).toBeGreaterThan(0);
  });

  it("returns null for unknown template type", () => {
    const db = makeDb();
    const wf = startWorkflow(db, "unknown_type", "x1", null);
    expect(wf).toBeNull();
  });

  it("rejects duplicate active workflows for the same target", () => {
    const db = makeDb({
      workflows: [
        {
          id: "wf1",
          type: "invoice_collection",
          targetId: "inv1",
          contactId: null,
          status: "active",
          startedAt: new Date().toISOString(),
        },
      ],
    });
    const wf = startWorkflow(db, "invoice_collection", "inv1", null);
    expect(wf).toBeNull();
  });

  it("rejects workflow completed within last 7 days", () => {
    const recentlyCompleted = new Date(Date.now() - 2 * 86400000).toISOString();
    const db = makeDb({
      workflows: [
        {
          id: "wf2",
          type: "invoice_collection",
          targetId: "inv2",
          contactId: null,
          status: "completed",
          completedAt: recentlyCompleted,
        },
      ],
    });
    const wf = startWorkflow(db, "invoice_collection", "inv2", null);
    expect(wf).toBeNull();
  });

  it("allows a new workflow if previous was completed >7 days ago", () => {
    const oldCompleted = new Date(Date.now() - 10 * 86400000).toISOString();
    const db = makeDb({
      workflows: [
        {
          id: "wf3",
          type: "invoice_collection",
          targetId: "inv3",
          contactId: null,
          status: "completed",
          completedAt: oldCompleted,
        },
      ],
    });
    const wf = startWorkflow(db, "invoice_collection", "inv3", null);
    expect(wf).not.toBeNull();
  });
});

describe("advanceWorkflows()", () => {
  it("executes step 0 on day 0", () => {
    const wf = startWorkflow(makeDb(), "invoice_collection", "inv1", null);
    const db = makeDb({ workflows: [wf] });
    const { workflows, actions } = advanceWorkflows(db);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].action).toBe("remind");
    expect(workflows[0].currentStep).toBeGreaterThan(0);
  });

  it("pauses on contact reply in memory", () => {
    const wf = startWorkflow(makeDb(), "invoice_collection", "inv1", "c1");
    const db = makeDb({
      workflows: [wf],
      memory: [
        {
          id: "m1",
          contactId: "c1",
          type: "reply",
          at: new Date().toISOString(),
        },
      ],
    });
    const { workflows } = advanceWorkflows(db);
    expect(workflows[0].status).toBe("paused");
    expect(workflows[0].pauseReason).toBe("Contact responded");
  });

  it("does not advance completed workflows", () => {
    const wf = startWorkflow(makeDb(), "deal_followup", "deal1", null);
    wf.status = "completed";
    const db = makeDb({ workflows: [wf] });
    const { actions } = advanceWorkflows(db);
    expect(actions.length).toBe(0);
  });
});
