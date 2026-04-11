import { T } from "../lib/theme.js";
import { da, iso } from "../lib/utils.js";
import { executiveDecisions } from "../lib/engine/decisions.js";
import { executeAction } from "../lib/engine/execution.js";
import { advanceWorkflows } from "../lib/engine/workflows.js";
import AgentMeta from "../components/AgentMeta.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";

export default function AgentView({ db, onUpdate }) {
  const decisions = executiveDecisions(db);
  const workflows = db.workflows || [];
  const activeWf = workflows.filter((w) => w.status === "active");
  const completedWf = workflows.filter((w) => w.status === "completed");

  const agentStats = Object.keys(AgentMeta).map((agent) => {
    const agentDecisions = decisions.filter((d) => d.agent === agent);
    const agentAudit = (db.audit || []).filter((a) => a.agent.toLowerCase() === agent);
    const agentWf = workflows.filter((w) => w.agent === agent && w.status === "active");
    return { agent, meta: AgentMeta[agent], decisions: agentDecisions, executions: agentAudit.length, activeWorkflows: agentWf.length };
  });

  async function runCycle() {
    let updated = JSON.parse(JSON.stringify(db));

    // Advance workflows
    const { workflows: newWfs, actions } = advanceWorkflows(updated);
    updated.workflows = newWfs;

    // Auto-execute safe decisions
    const autoDecs = executiveDecisions(updated).filter((d) => d.auto && !d.needsApproval);
    for (const dec of autoDecs.slice(0, 5)) {
      updated = await executeAction(updated, dec, { approvedBy: "auto" });
    }

    updated.cfg.lastCycle = iso();
    onUpdate(updated);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Agent Dashboard</h2>
          <div style={{ fontSize: 13, color: T.dm }}>
            Last cycle: {db.cfg.lastCycle ? new Date(db.cfg.lastCycle).toLocaleTimeString() : "Never"}
          </div>
        </div>
        <Button onClick={runCycle}>▶ Run Cycle</Button>
      </div>

      {/* Agent cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        {agentStats.map(({ agent, meta, decisions: decs, executions, activeWorkflows }) => (
          <div
            key={agent}
            style={{
              background: T.wh,
              border: `1px solid ${T.bd}`,
              borderRadius: 12,
              padding: "16px 18px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: meta.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                }}
              >
                {meta.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.tx }}>{meta.label}</div>
                <Pill
                  label={decs.length > 0 ? `${decs.length} pending` : "Idle"}
                  variant={decs.length > 0 ? "blue" : "muted"}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: meta.color }}>{executions}</div>
                <div style={{ fontSize: 10, color: T.mt }}>Executions</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.bl }}>{activeWorkflows}</div>
                <div style={{ fontSize: 10, color: T.mt }}>Active WFs</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Active Workflows */}
      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: T.tx }}>
          Active Workflows ({activeWf.length})
        </h3>
        {activeWf.length === 0 ? (
          <p style={{ color: T.mt, fontSize: 13 }}>No active workflows.</p>
        ) : (
          activeWf.map((wf) => {
            const meta = AgentMeta[wf.agent] || { icon: "🤖", label: wf.agent };
            const progress = Math.round((wf.currentStep / wf.steps.length) * 100);
            return (
              <div
                key={wf.id}
                style={{ padding: "10px 0", borderBottom: `1px solid ${T.bd}` }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
                      {meta.icon} {wf.type.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 11, color: T.mt, marginLeft: 8 }}>
                      Step {wf.currentStep}/{wf.steps.length}
                    </span>
                  </div>
                  <Pill label={`${progress}%`} variant="blue" />
                </div>
                <div style={{ background: T.bd, borderRadius: 4, height: 4, marginTop: 6 }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: T.bl, borderRadius: 4 }} />
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
