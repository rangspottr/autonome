import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Table from "../components/Table.jsx";
import AIStatusBar from "../components/AIStatusBar.jsx";
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
            <div className={styles.agentName}>{meta.title || meta.label} Agent</div>
            <div className={styles.agentDesc}>{meta.description || "Full operator profile"}</div>
            {meta.focus && <div className={styles.agentFocusTag}>{meta.focus}</div>}
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
              <p className={styles.detailEmpty}>{meta.monitoringStatement || `${meta.label} is monitoring your business`}. No actions needed right now.</p>
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
              <p className={styles.detailEmpty}>{meta.label} hasn't taken any actions yet. Actions will appear here as {meta.label} detects patterns and responds to business events.</p>
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
              <p className={styles.detailEmpty}>{meta.label} is building its understanding of your business. Observations and learned patterns will appear here over time.</p>
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

/**
 * Render 2-3 domain-specific metric items for an agent card.
 */
function AgentDomainMetrics({ agent, workstream, decisions, activeWorkflows }) {
  const blockerCount = workstream?.blockers?.length || 0;
  const pendingCount = decisions?.length || 0;

  if (agent === "finance") {
    const overdueAmt = workstream?.summary?.overdueInvoices || 0;
    const overdueCount = workstream?.summary?.overdueCount || 0;
    return (
      <>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Overdue</div>
          <div className={styles.agentMetricVal} style={{ color: overdueAmt > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
            {overdueAmt > 0 ? `$${Math.round(overdueAmt).toLocaleString()}` : "None"}
          </div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Invoices</div>
          <div className={styles.agentMetricVal} style={{ color: "var(--color-text-secondary)" }}>{overdueCount}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Pending</div>
          <div className={styles.agentMetricVal} style={{ color: pendingCount > 0 ? "var(--color-brand)" : "var(--color-text-muted)" }}>{pendingCount}</div>
        </div>
      </>
    );
  }

  if (agent === "revenue") {
    const pipelineVal = workstream?.summary?.pipelineValue || 0;
    const staleCount = workstream?.summary?.staleDeals || 0;
    return (
      <>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Pipeline</div>
          <div className={styles.agentMetricVal} style={{ color: "var(--color-brand)" }}>
            {pipelineVal > 0 ? `$${Math.round(pipelineVal / 1000)}k` : "$0"}
          </div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Stale Deals</div>
          <div className={styles.agentMetricVal} style={{ color: staleCount > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>{staleCount}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Pending</div>
          <div className={styles.agentMetricVal} style={{ color: pendingCount > 0 ? "var(--color-brand)" : "var(--color-text-muted)" }}>{pendingCount}</div>
        </div>
      </>
    );
  }

  if (agent === "operations") {
    const overdueTaskCount = workstream?.summary?.overdueTasks || 0;
    return (
      <>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Overdue Tasks</div>
          <div className={styles.agentMetricVal} style={{ color: overdueTaskCount > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>{overdueTaskCount}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Active WFs</div>
          <div className={styles.agentMetricVal} style={{ color: "var(--color-brand)" }}>{activeWorkflows}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Blockers</div>
          <div className={styles.agentMetricVal} style={{ color: blockerCount > 0 ? "var(--color-danger)" : "var(--color-text-muted)" }}>{blockerCount}</div>
        </div>
      </>
    );
  }

  if (agent === "support") {
    const atRiskCount = workstream?.summary?.atRiskContacts || 0;
    const blockedActions = workstream?.summary?.blockedActionCount || 0;
    const dealRegressions = workstream?.summary?.dealRegressions || 0;
    return (
      <>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>At Risk</div>
          <div className={styles.agentMetricVal} style={{ color: atRiskCount > 0 ? "var(--color-danger)" : "var(--color-text-muted)" }}>{atRiskCount}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Blocked</div>
          <div className={styles.agentMetricVal} style={{ color: blockedActions > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>{blockedActions}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Regressions</div>
          <div className={styles.agentMetricVal} style={{ color: dealRegressions > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>{dealRegressions}</div>
        </div>
      </>
    );
  }

  if (agent === "growth") {
    const dormantCustomers = workstream?.summary?.dormantCustomers || 0;
    const staleLeads = workstream?.summary?.staleLeads || 0;
    const expansionOpps = workstream?.summary?.expansionOpportunities || 0;
    return (
      <>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Dormant</div>
          <div className={styles.agentMetricVal} style={{ color: dormantCustomers > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>{dormantCustomers}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Stale Leads</div>
          <div className={styles.agentMetricVal} style={{ color: staleLeads > 0 ? "var(--color-warning)" : "var(--color-text-muted)" }}>{staleLeads}</div>
        </div>
        <div className={styles.agentMetric}>
          <div className={styles.agentMetricLabel}>Expansion</div>
          <div className={styles.agentMetricVal} style={{ color: expansionOpps > 0 ? "var(--color-brand)" : "var(--color-text-muted)" }}>{expansionOpps}</div>
        </div>
      </>
    );
  }

  // Generic fallback
  return (
    <>
      <div className={styles.agentMetric}>
        <div className={styles.agentMetricLabel}>Active WFs</div>
        <div className={styles.agentMetricVal} style={{ color: "var(--color-brand)" }}>{activeWorkflows}</div>
      </div>
      <div className={styles.agentMetric}>
        <div className={styles.agentMetricLabel}>Pending</div>
        <div className={styles.agentMetricVal} style={{ color: pendingCount > 0 ? "var(--color-brand)" : "var(--color-text-muted)" }}>{pendingCount}</div>
      </div>
    </>
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
  const [agentWorkstreams, setAgentWorkstreams] = useState({});

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

  // Fetch domain-specific workstream data for agent card metrics (non-blocking)
  const fetchWorkstreams = useCallback(async () => {
    const results = {};
    await Promise.all(
      Object.keys(AgentMeta).map(async (agent) => {
        try {
          const ws = await api.get(`/agents/${agent}/workstream`);
          results[agent] = ws;
        } catch {
          // non-fatal
        }
      })
    );
    setAgentWorkstreams(results);
  }, []);

  useEffect(() => {
    fetchData();
    fetchWorkstreams();
  }, [fetchData, fetchWorkstreams]);

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
      workstream: agentWorkstreams[agent] || null,
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
            <AIStatusBar lastRunAt={status?.lastRunAt} />
          </div>
        </div>
        <Button onClick={runCycle} disabled={running} variant="secondary">{running ? "Running…" : "Run Business Scan"}</Button>
      </div>

      {/* Agent cards */}
      {agentStats.length === 0 ? (
        <EmptyState icon="○" title="Agent team initializing" description="Your five specialists are completing their first scan. They'll appear here momentarily with monitoring status and pending decisions." statusIndicator />
      ) : (
        <div className={styles.agentsGrid}>
          {agentStats.map(({ agent, meta, decisions: decs, executions: _executions, activeWorkflows: awf, workstream }) => {
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
                    <div className={styles.agentSubtitle}>{meta.description}</div>
                    {meta.ownershipStatement && (
                      <div className={styles.agentOwnership}>{meta.ownershipStatement}</div>
                    )}
                    <div className={styles.agentCardBadgeRow}>
                      {meta.focus && (
                        <span className={styles.agentFocusBadge} style={{ color: meta.color, borderColor: meta.color }}>
                          {meta.focus}
                        </span>
                      )}
                      <Pill
                        label={decs.length > 0 ? `${decs.length} pending` : "Monitoring"}
                        variant={decs.length > 0 ? "blue" : "muted"}
                      />
                    </div>
                  </div>
                </div>
                <div className={styles.agentMetrics}>
                  <AgentDomainMetrics
                    agent={agent}
                    workstream={workstream}
                    decisions={decs}
                    activeWorkflows={awf}
                  />
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
          emptyDescription="No active workflows. Workflows are created automatically when agents detect patterns requiring multi-step resolution."
        />
      </div>
    </div>
  );
}

