import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Table from "../components/Table.jsx";
import styles from "./AgentView.module.css";

const MEMORY_TYPE_LABELS = {
  observation: "Observation",
  learned_preference: "Learned",
  blocker: "Blocker",
  entity_note: "Note",
};

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function AgentDetailPanel({ agent, meta, onClose }) {
  const [workstream, setWorkstream] = useState(null);
  const [actions, setActions] = useState([]);
  const [memory, setMemory] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedReasoning, setExpandedReasoning] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/agents/${agent}/workstream`),
      api.get(`/agents/${agent}/actions?limit=20`),
      api.get(`/agents/${agent}/memory?limit=20`),
      api.get(`/agents/handoffs`),
    ])
      .then(([ws, acts, mem, hfs]) => {
        if (cancelled) return;
        setWorkstream(ws);
        setActions(acts.actions || []);
        setMemory(mem || []);
        setHandoffs((hfs || []).filter((h) => h.agent === agent || h.handed_off_to === agent));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agent]);

  const memoryByType = memory.reduce((acc, m) => {
    const t = m.memory_type || "observation";
    if (!acc[t]) acc[t] = [];
    acc[t].push(m);
    return acc;
  }, {});

  const blockers = workstream?.blockers || [];

  return (
    <div className={styles.detailPanel} style={{ borderTopColor: meta.color }}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderLeft}>
          <div className={styles.agentIcon} style={{ background: meta.bg, color: meta.color }}>
            {meta.icon}
          </div>
          <div>
            <div className={styles.agentName}>{meta.label} Agent</div>
            <div className={styles.agentDesc}>Full operator profile</div>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>

      {loading ? (
        <div className={styles.detailBody}>
          {[1,2,3].map(i => <Skeleton key={i} variant="rect" height={60} style={{ marginBottom: 12 }} />)}
        </div>
      ) : (
        <div className={styles.detailBody}>
          {/* Active Work */}
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Active Work</div>
            {(workstream?.pendingDecisions || []).length === 0 && (workstream?.activeWorkflows || []).length === 0 ? (
              <p className={styles.detailEmpty}>{meta.label} agent is idle — no pending decisions or active workflows.</p>
            ) : (
              <>
                {(workstream?.pendingDecisions || []).map((d, i) => (
                  <div key={i} className={styles.timelineItem} style={{ borderLeftColor: meta.color }}>
                    <div className={styles.timelineItemTitle}>{d.desc}</div>
                    <Pill label="Pending Decision" variant="amber" />
                  </div>
                ))}
                {(workstream?.activeWorkflows || []).map((wf) => {
                  const steps = Array.isArray(wf.steps) ? wf.steps : (() => { try { return JSON.parse(wf.steps); } catch { return []; } })();
                  const totalSteps = steps.length || 1;
                  const currentStep = wf.current_step || 0;
                  return (
                    <div key={wf.id} className={styles.timelineItem} style={{ borderLeftColor: meta.color }}>
                      <div className={styles.timelineItemTitle}>{wf.template.replace(/_/g, " ")}</div>
                      <div className={styles.timelineItemMeta}>
                        Step {currentStep} of {totalSteps} · {wf.contact_name || ""}
                      </div>
                      <div className={styles.workflowProgress}>
                        <div
                          className={styles.workflowProgressBar}
                          style={{ width: `${Math.round((currentStep / totalSteps) * 100)}%`, background: meta.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Action Timeline */}
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Action Timeline</div>
            {actions.length === 0 ? (
              <p className={styles.detailEmpty}>{meta.label} agent has no recorded actions yet. Actions appear here as the agent processes decisions.</p>
            ) : (
              actions.map((a) => (
                <div key={a.id} className={styles.timelineItem} style={{ borderLeftColor: meta.color }}>
                  <div className={styles.timelineItemRow}>
                    <div className={styles.timelineItemTitle}>{a.description}</div>
                    <span className={styles.timelineItemTime}>{relativeTime(a.created_at)}</span>
                  </div>
                  {a.entity_name && (
                    <div className={styles.timelineItemMeta}>{a.entity_type} · {a.entity_name}</div>
                  )}
                  <div className={styles.timelineItemPills}>
                    <Pill
                      label={a.outcome || "completed"}
                      variant={a.outcome === "completed" ? "green" : a.outcome === "blocked" ? "red" : a.outcome === "handed_off" ? "blue" : "muted"}
                    />
                    {a.handed_off_to && (
                      <Pill label={`→ ${a.handed_off_to}`} variant="blue" />
                    )}
                  </div>
                  {a.reasoning && (
                    <div>
                      <button
                        className={styles.reasoningToggle}
                        onClick={() => setExpandedReasoning(expandedReasoning === a.id ? null : a.id)}
                      >
                        {expandedReasoning === a.id ? "▲ Hide reasoning" : "▼ Why?"}
                      </button>
                      {expandedReasoning === a.id && (
                        <div className={styles.reasoningBox}>{a.reasoning}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Memory */}
          <div className={styles.detailSection}>
            <div className={styles.detailSectionTitle}>Agent Memory</div>
            {memory.length === 0 ? (
              <p className={styles.detailEmpty}>{meta.label} agent hasn't accumulated memory yet. Memory builds as the agent processes patterns across cycles.</p>
            ) : (
              Object.entries(memoryByType).map(([type, items]) => (
                <div key={type} className={styles.memoryGroup}>
                  <div className={styles.memoryGroupLabel}>{MEMORY_TYPE_LABELS[type] || type}</div>
                  {items.map((m) => (
                    <div key={m.id} className={styles.memoryItem}>
                      <div className={styles.memoryContent}>{m.content}</div>
                      <div className={styles.timelineItemTime}>{relativeTime(m.created_at)}</div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Handoffs */}
          {handoffs.length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>Handoffs</div>
              {handoffs.map((h) => (
                <div key={h.id} className={styles.timelineItem} style={{ borderLeftColor: h.agent === agent ? meta.color : "#9AA1AE" }}>
                  <div className={styles.timelineItemRow}>
                    <div className={styles.timelineItemTitle}>{h.description}</div>
                    <span className={styles.timelineItemTime}>{relativeTime(h.created_at)}</span>
                  </div>
                  <div className={styles.timelineItemPills}>
                    <Pill label={`${h.agent} → ${h.handed_off_to}`} variant="blue" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Blockers */}
          {blockers.length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>Blockers</div>
              {blockers.map((b) => (
                <div key={b.id} className={styles.timelineItem} style={{ borderLeftColor: "#DC2626" }}>
                  <div className={styles.timelineItemTitle}>{b.description}</div>
                  <Pill label="Blocked" variant="red" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentView({ onRefreshMetrics }) {
  const [status, setStatus] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [auditCounts, setAuditCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);

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
          {agentStats.map(({ agent, meta, decisions: decs, executions, activeWorkflows: awf }) => {
            const isSelected = selectedAgent === agent;
            return (
              <div
                key={agent}
                className={`${styles.agentCard} ${isSelected ? styles.agentCardActive : ""}`}
                style={{ borderTopColor: isSelected ? meta.color : undefined }}
                onClick={() => setSelectedAgent(isSelected ? null : agent)}
              >
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
                <div className={styles.agentCardCta} style={{ color: meta.color }}>
                  {isSelected ? "▲ Collapse" : "▼ View profile"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent Detail Panel */}
      {selectedAgent && AgentMeta[selectedAgent] && (
        <AgentDetailPanel
          agent={selectedAgent}
          meta={AgentMeta[selectedAgent]}
          onClose={() => setSelectedAgent(null)}
        />
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
          emptyDescription="Workflows start automatically when agents detect issues requiring multi-step resolution."
        />
      </div>
    </div>
  );
}

