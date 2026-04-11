export function calcHealth(db) {
  let score = 50;

  const revenue = (db.txns || [])
    .filter((t) => t.type === "inc")
    .reduce((sum, t) => sum + (t.amt || 0), 0);

  const expenses = (db.txns || [])
    .filter((t) => t.type === "exp")
    .reduce((sum, t) => sum + (t.amt || 0), 0);

  if (revenue > expenses) score += 15;
  if (revenue > 0 && (revenue - expenses) / revenue > 0.2) score += 10;

  const openDeals = (db.deals || []).filter((d) => d.stage !== "closed");
  if (openDeals.length >= 3) score += 5;

  const tasks = db.tasks || [];
  if (tasks.length > 0 && tasks.filter((t) => t.st === "done").length / tasks.length > 0.5) {
    score += 5;
  }

  // Deductions
  score -= tasks.filter((t) => t.st !== "done" && t.due && new Date(t.due) < new Date()).length * 3;
  score -= (db.assets || []).filter((a) => a.rp > 0 && a.qty < a.rp).length * 5;

  if ((db.contacts || []).length === 0) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}
