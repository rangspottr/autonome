import { T } from "../lib/theme.js";
import { $$, iso } from "../lib/utils.js";
import { executiveDecisions } from "../lib/engine/decisions.js";
import { executeAction } from "../lib/engine/execution.js";
import AgentMeta from "../components/AgentMeta.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";

export default function ApprovalView({ db, onUpdate }) {
  const decisions = executiveDecisions(db);
  const pendingApprovals = decisions.filter((d) => d.needsApproval);

  async function approve(decision) {
    const updated = await executeAction(db, { ...decision, auto: false }, { approvedBy: "operator" });
    onUpdate(updated);
  }

  function reject(decision) {
    const updated = JSON.parse(JSON.stringify(db));
    updated.audit = [
      ...(updated.audit || []),
      {
        id: Date.now().toString(36),
        at: iso(),
        agent: decision.agent,
        action: "rejected",
        target: decision.target,
        desc: `Rejected: ${decision.desc}`,
        auto: false,
        approvedBy: null,
      },
    ];
    onUpdate(updated);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>
          Pending Approvals
        </h2>
        <div style={{ fontSize: 13, color: T.dm }}>
          {pendingApprovals.length} action{pendingApprovals.length !== 1 ? "s" : ""} awaiting your review
        </div>
      </div>

      {pendingApprovals.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.gn }}>No pending approvals</div>
          </div>
        </Card>
      ) : (
        pendingApprovals.map((decision) => {
          const meta = AgentMeta[decision.agent] || { icon: "🤖", label: decision.agent, color: T.dm, bg: T.bg };
          return (
            <Card key={`${decision.agent}-${decision.action}-${decision.target}`}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: meta.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  {meta.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 4 }}>
                    {decision.desc}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <Pill label={meta.label} variant="blue" />
                    {decision.impact > 0 && (
                      <Pill label={`${$$(decision.impact)} expected impact`} variant="green" />
                    )}
                    <Pill label={`Priority: ${decision.priority}`} variant="amber" />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button onClick={() => approve(decision)} size="sm">
                      ✓ Approve
                    </Button>
                    <Button variant="secondary" onClick={() => reject(decision)} size="sm">
                      ✕ Reject
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
