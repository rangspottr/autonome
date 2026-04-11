import { describe, it, expect } from "vitest";
import { calcROI } from "../roi.js";

function makeDb(overrides = {}) {
  return {
    outcomes: {
      collected: 0,
      dealsClosed: 0,
      dealsProgressed: 0,
      emailsSent: 0,
      leadsQualified: 0,
      tasksAuto: 0,
      saved: 0,
    },
    sent: [],
    workflows: [],
    ...overrides,
  };
}

describe("calcROI()", () => {
  it("returns zero values for empty db", () => {
    const roi = calcROI(makeDb());
    expect(roi.totalActions).toBe(0);
    expect(roi.hoursSaved).toBe(0);
    expect(roi.moneySaved).toBe(0);
    expect(roi.headcountEquiv).toBe(0);
  });

  it("counts only delivered emails in totalActions (not simulated)", () => {
    const db = makeDb({
      sent: [
        { id: "s1", type: "email", delivered: true },
        { id: "s2", type: "email", delivered: false, simulated: true },
        { id: "s3", type: "email", delivered: true },
      ],
      outcomes: { ...makeDb().outcomes, emailsSent: 3 }, // emailsSent would be 3 but only 2 delivered
    });
    const roi = calcROI(db);
    expect(roi.realSent).toBe(2);
    expect(roi.loggedSent).toBe(1);
    expect(roi.totalActions).toBe(2); // only realSent counts
  });

  it("includes leadsQualified and tasksAuto in totalActions", () => {
    const db = makeDb({
      sent: [],
      outcomes: {
        ...makeDb().outcomes,
        leadsQualified: 3,
        tasksAuto: 2,
      },
    });
    const roi = calcROI(db);
    expect(roi.totalActions).toBe(5);
  });

  it("calculates hoursSaved and moneySaved accurately", () => {
    const db = makeDb({
      sent: [
        { id: "s1", delivered: true },
        { id: "s2", delivered: true },
      ],
      outcomes: { ...makeDb().outcomes, leadsQualified: 2 },
    });
    const roi = calcROI(db);
    // totalActions = 2 (realSent) + 2 (leadsQualified) = 4
    // hoursSaved = 4 * 0.25 = 1
    // moneySaved = 1 * 35 = 35
    expect(roi.totalActions).toBe(4);
    expect(roi.hoursSaved).toBe(1);
    expect(roi.moneySaved).toBe(35);
  });

  it("does NOT inflate totalActions from simulated-only emails", () => {
    const db = makeDb({
      sent: [
        { id: "s1", delivered: false, simulated: true },
        { id: "s2", delivered: false, simulated: true },
      ],
      outcomes: { ...makeDb().outcomes, emailsSent: 2 },
    });
    const roi = calcROI(db);
    expect(roi.totalActions).toBe(0);
    expect(roi.hoursSaved).toBe(0);
    expect(roi.moneySaved).toBe(0);
    expect(roi.loggedSent).toBe(2);
    expect(roi.realSent).toBe(0);
  });

  it("exposes realSent and loggedSent for transparency", () => {
    const db = makeDb({
      sent: [
        { id: "s1", delivered: true },
        { id: "s2", delivered: false },
        { id: "s3", delivered: false },
      ],
    });
    const roi = calcROI(db);
    expect(roi.realSent).toBe(1);
    expect(roi.loggedSent).toBe(2);
  });

  it("counts workflow stats correctly", () => {
    const db = makeDb({
      workflows: [
        { status: "active", outcome: null },
        { status: "active", outcome: null },
        { status: "completed", outcome: "payment_received" },
        { status: "completed", outcome: "exhausted" },
      ],
    });
    const roi = calcROI(db);
    expect(roi.activeWf).toBe(2);
    expect(roi.completedWf).toBe(2);
    expect(roi.paidWf).toBe(1);
  });
});
