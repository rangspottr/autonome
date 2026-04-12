import { useState, useEffect, useCallback } from "react";
import { T } from "../lib/theme.js";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";

export default function AgentView({ onRefreshMetrics }) {
  const [status, setStatus] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [auditCounts, setAuditCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statusRes, decisionsRes, workflowsRes, auditRes] = await Promise.all([
        api.get("/agent/status"),
        api.get("/agent/decisions"),
        api.get("/workflows"),
        api.get("/audit-log"),
      ]);
      setStatus(statusRes);
      setDecisions(decisionsRes.pendingDecisions || []);
      setWorkflows(workflowsRes || []);

      const counts = {};
      (auditRes || []).forEach((entry) => {
        const key = (entry.agent || "").toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      });
      setAuditCounts(counts);
    } catch (err) {
      setError(err.message || "Failed to load agent data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeWf = workflows.filter((w) => w.status === "active");

  const agentStats = Object.keys(AgentMeta).map((agent) => {
    const agentDecisions = decisions.filter((d) => d.agent === agent);
    const agentActiveWf = workflows.filter((w) => w.agent === agent && w.status === "active");
    return {
      agent,
      meta: AgentMeta[agent],
      decisions: agentDecisions,
      executions: auditCounts[agent] || 0,
      activeWorkflows: agentActiveWf.length,
    };
  });

  async function runCycle() {
    try {
      setRunning(true);
      setError(null);
      await api.post("/agent/run-cycle");
      await fetchData();
      onRefreshMetrics?.();
    } catch (err) {
      setError(err.message || "Cycle failed");
    } finally {
      setRunning(false);
    }
  }

  function parseSteps(wf) {
    if (Array.isArray(wf.steps)) return wf.steps;
    if (typeof wf.steps === "string") {
      try { return JSON.parse(wf.steps); } catch { return []; }
    }
    return [];
  }

  if (loading) {
    return <p style={{ color: T.mt, fontSize: 13, padding: 20 }}>Loading agent data…</p>;
  }

  return (
    <div>
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#DC2626", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Agent Dashboard</h2>
          <div style={{ fontSize: 13, color: T.dm }}>
            Last cycle: {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : "Never"}
          </div>
        </div>
        <Button onClick={runCycle} disabled={running}>{running ? "⏳ Running…" : "▶ Run Cycle"}</Button>
      </div>

      {/* Agent cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        {agentStats.map(({ agent, meta, decisions: decs, executions, activeWorkflows: awf }) => (
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
                  fontSize: 10,
                  fontWeight: 700,
                  color: meta.color,
                  letterSpacing: 0.5,
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
                <div style={{ fontSize: 18, fontWeight: 700, color: T.bl }}>{awf}</div>
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
            const meta = AgentMeta[wf.agent] || { icon: "CMD", label: wf.agent };
            const steps = parseSteps(wf);
            const currentStep = wf.current_step ?? 0;
            const totalSteps = steps.length || 1;
            const progress = Math.round((currentStep / totalSteps) * 100);
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
                      Step {currentStep}/{totalSteps}
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
