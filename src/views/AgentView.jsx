import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Table from "../components/Table.jsx";
import styles from "./AgentView.module.css";

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
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <Skeleton variant="text" height={28} width={200} />
          <Skeleton variant="rect" height={36} width={120} />
        </div>
        <div className={styles.agentsGrid}>
          {[1,2,3,4].map(i => <Skeleton key={i} variant="card" height={140} />)}
        </div>
        <Skeleton variant="rect" height={300} />
      </div>
    );
  }

  const workflowColumns = [
    {
      key: "type",
      label: "Workflow",
      render: (val, row) => {
        const meta = AgentMeta[row.agent] || { icon: "CMD", label: row.agent };
        const steps = parseSteps(row);
        const currentStep = row.current_step ?? 0;
        const totalSteps = steps.length || 1;
        return (
          <span>
            <span className={styles.workflowType}>
              {meta.icon} {val.replace(/_/g, " ")}
            </span>
            <span className={styles.workflowStep}>
              Step {currentStep}/{totalSteps}
            </span>
          </span>
        );
      },
    },
    {
      key: "agent",
      label: "Agent",
      render: (val) => {
        const meta = AgentMeta[val] || { label: val };
        return <Pill label={meta.label} variant="blue" />;
      },
    },
    {
      key: "current_step",
      label: "Progress",
      align: "right",
      render: (val, row) => {
        const steps = parseSteps(row);
        const currentStep = row.current_step ?? 0;
        const totalSteps = steps.length || 1;
        const progress = Math.round((currentStep / totalSteps) * 100);
        return <Pill label={`${progress}%`} variant="blue" />;
      },
    },
  ];

  return (
    <div className={styles.page}>
      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Agent Dashboard</h2>
          <div className={styles.headerSubtitle}>
            Last cycle: {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : "Never"}
          </div>
        </div>
        <Button onClick={runCycle} disabled={running}>{running ? "⏳ Running…" : "▶ Run Cycle"}</Button>
      </div>

      {/* Agent cards */}
      {agentStats.length === 0 ? (
        <EmptyState icon="○" title="No agents configured" description="Agent metadata is not available." />
      ) : (
        <div className={styles.agentsGrid}>
          {agentStats.map(({ agent, meta, decisions: decs, executions, activeWorkflows: awf }) => (
            <div key={agent} className={styles.agentCard}>
              <div className={styles.agentCardHeader}>
                <div
                  className={styles.agentIcon}
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.icon}
                </div>
                <div className={styles.agentInfo}>
                  <div className={styles.agentName}>{meta.label}</div>
                  <div className={styles.agentDesc}>
                    <Pill
                      label={decs.length > 0 ? `${decs.length} pending` : "Idle"}
                      variant={decs.length > 0 ? "blue" : "muted"}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.agentMetrics}>
                <div className={styles.agentMetric}>
                  <div className={styles.agentMetricLabel}>Executions</div>
                  <div className={styles.agentMetricVal} style={{ color: meta.color }}>{executions}</div>
                </div>
                <div className={styles.agentMetric}>
                  <div className={styles.agentMetricLabel}>Active WFs</div>
                  <div className={styles.agentMetricVal} style={{ color: 'var(--color-brand)' }}>{awf}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Workflows */}
      <div className={styles.workflowSection}>
        <div className={styles.workflowHeader}>
          <span className={styles.workflowTitle}>Active Workflows</span>
          <span className={styles.workflowCount}>{activeWf.length} active</span>
        </div>
        <Table
          columns={workflowColumns}
          data={activeWf}
          loading={false}
          emptyIcon="○"
          emptyTitle="No active workflows"
          emptyDescription="Workflows will appear here when agents are running tasks."
        />
      </div>
    </div>
  );
}
