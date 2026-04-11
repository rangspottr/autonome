export function calcROI(db) {
  const outcomes = db.outcomes || {};
  const hourlyRate = 35;
  const hoursPerAction = 0.25;

  const sent = db.sent || [];
  const realSent = sent.filter((s) => s.delivered).length;
  const loggedSent = sent.filter((s) => !s.delivered).length;

  const totalActions =
    realSent +
    (outcomes.leadsQualified || 0) +
    (outcomes.tasksAuto || 0);

  const hoursSaved = totalActions * hoursPerAction;
  const moneySaved = hoursSaved * hourlyRate;
  const headcountEquiv = hoursSaved / 160;

  const workflows = db.workflows || [];
  const activeWf = workflows.filter((w) => w.status === "active").length;
  const completedWf = workflows.filter((w) => w.status === "completed").length;
  const paidWf = workflows.filter((w) => w.outcome === "payment_received").length;

  return {
    totalActions,
    hoursSaved: Math.round(hoursSaved * 10) / 10,
    moneySaved: Math.round(moneySaved),
    headcountEquiv: Math.round(headcountEquiv * 10) / 10,
    collected: outcomes.collected || 0,
    dealsClosed: outcomes.dealsClosed || 0,
    realSent,
    loggedSent,
    activeWf,
    completedWf,
    paidWf,
  };
}
