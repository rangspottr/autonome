import { useState, useEffect, useCallback } from "react";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import AgentMeta from "../components/AgentMeta.js";
import Input from "../components/Input.jsx";
import Stat from "../components/Stat.jsx";
import Skeleton from "../components/Skeleton.jsx";
import styles from "./CmdCenter.module.css";
import { T } from "../lib/theme.js";

const TIER_CONFIG = [
  { label: "Money at Risk", min: 90, color: T.rd, bg: T.rdL, pillVariant: "red" },
  { label: "Revenue Opportunities", min: 70, color: T.bl, bg: T.blL, pillVariant: "blue" },
  { label: "Operational Health", min: 50, color: T.am, bg: T.amL, pillVariant: "amber" },
  { label: "Optimization", min: 0, color: T.mt, bg: "#F1F3F5", pillVariant: "muted" },
];

const AGENT_BORDER_COLORS = {
  finance: T.gn,
  revenue: T.bl,
  operations: T.am,
  growth: T.pu,
  support: "#0891B2",
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

function buildSinceLoginSummary(events) {
  if (!events || events.length === 0) return null;
  const byAgent = {};
  let totalAmount = 0;
  let approvalCount = 0;
  for (const e of events) {
    if (!byAgent[e.agent]) byAgent[e.agent] = 0;
    byAgent[e.agent]++;
    if (e.metadata?.impact) totalAmount += parseFloat(e.metadata.impact) || 0;
    if (e.outcome === "pending") approvalCount++;
  }
  const parts = Object.entries(byAgent).map(([agent, count]) => {
    const meta = AgentMeta[agent] || { label: agent };
    return `${meta.label} took ${count} action${count !== 1 ? "s" : ""}`;
  });
  const summary = parts.join(". ");
  return {
    text: summary + (totalAmount > 0 ? `. ${$$(totalAmount)} in financial activity.` : ".") +
      (approvalCount > 0 ? ` ${approvalCount} item${approvalCount !== 1 ? "s" : ""} need your approval.` : ""),
    count: events.length,
  };
}

export default function CmdCenter({ onRefreshMetrics }) {
  const [decisions, setDecisions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activityFeed, setActivityFeed] = useState([]);
  const [insights, setInsights] = useState([]);
  const [agentMemory, setAgentMemory] = useState([]);

  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [showBriefing, setShowBriefing] = useState(true);
  const [executing, setExecuting] = useState(null);
  const [showMissedCall, setShowMissedCall] = useState(false);
  const [callForm, setCallForm] = useState({ phone: "", name: "", time: "", note: "" });
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [decisionsRes, summaryRes] = await Promise.all([
        api.get("/agent/decisions"),
        api.get("/metrics/summary"),
      ]);
      setDecisions(decisionsRes.pendingDecisions || []);
      setSummary(summaryRes);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load intelligence data (non-blocking, best-effort)
  const fetchIntelligence = useCallback(async () => {
    try {
      const [feedRes, insightsRes] = await Promise.all([
        api.get("/agents/activity-feed?limit=20"),
        api.get("/intelligence/summary"),
      ]);
      setActivityFeed(feedRes.events || []);
      setInsights(insightsRes || []);

      // Gather memory from all agents
      const allMemory = await Promise.all(
        Object.keys(AgentMeta).map((agent) =>
          api.get(`/agents/${agent}/memory?limit=3`).then((r) =>
            (r || []).slice(0, 3).map((m) => ({ ...m, agent }))
          ).catch(() => [])
        )
      );
      setAgentMemory(allMemory.flat().slice(0, 6));
    } catch {
      // Intelligence feed is non-fatal
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchIntelligence();
  }, [fetchData, fetchIntelligence]);

  // Derived metrics from summary
  const revenueAtRisk = summary?.invoices?.outstanding || 0;
  const pipelineRequiringAction = summary?.deals?.pipelineValue || 0;
  const pendingApprovals = decisions.filter((d) => d.needsApproval && !d.auto).length;
  const agentActionsToday = activityFeed.filter((e) => {
    return Date.now() - new Date(e.created_at).getTime() < 86400000;
  }).length;

  const sinceLoginSummary = buildSinceLoginSummary(activityFeed.slice(0, 10));

  async function handleExecute(decision) {
    setExecuting(decision.id);
    try {
      const endpoint = decision.needsApproval
        ? "/agent/approve/" + decision.id
        : "/agent/execute/" + decision.id;
      await api.post(endpoint, {
        agent: decision.agent,
        action: decision.action,
        target: decision.target,
        targetName: decision.targetName,
        contactId: decision.contactId,
        desc: decision.desc,
        auto: decision.auto,
        impact: decision.impact,
      });
      await fetchData();
      await fetchIntelligence();
      onRefreshMetrics?.();
    } catch (err) {
      setError(err.message || "Action failed");
    } finally {
      setExecuting(null);
    }
  }

  async function handleMissedCall() {
    try {
      const contactName = callForm.name || `Unknown (${callForm.phone})`;
      await api.post("/contacts", {
        name: contactName,
        phone: callForm.phone,
        type: "lead",
        tags: ["missed-call"],
      });
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      await api.post("/tasks", {
        title: `Call back: ${contactName}`,
        desc: callForm.note || "",
        priority: "high",
        due_date: tomorrow,
      });
      setShowMissedCall(false);
      setCallForm({ phone: "", name: "", time: "", note: "" });
      await fetchData();
      onRefreshMetrics?.();
    } catch (err) {
      setError(err.message || "Failed to log missed call");
    }
  }

  async function handleAiQuery() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiResponse(null);

    try {
      const data = await api.post("/ai/query", { message: aiQuery.trim() });
      setAiResponse(data.response || "No response received.");
    } catch (err) {
      setAiResponse(`Error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const result = await api.post("/agent-runs/trigger");
      setTriggerResult(result);
      await fetchData();
      await fetchIntelligence();
      onRefreshMetrics?.();
    } catch (err) {
      setError(err.message || "Agent trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  // Activation checklist from summary data
  const checklist = summary
    ? [
        { label: "Add your first real contact", done: (summary.contacts?.total || 0) > 0 },
        { label: "Create an invoice", done: (summary.invoices?.total || 0) > 0 },
        { label: "Set up a deal in the pipeline", done: (summary.deals?.total || 0) > 0 },
        { label: "Complete a task", done: (summary.tasks?.done || 0) > 0 },
        { label: "Review your first agent recommendation", done: (summary.recentAgentRuns || []).length > 0 },
      ]
    : [];
  const checklistAllDone = checklist.length > 0 && checklist.every((c) => c.done);

  // Group decisions by tier
  const tiers = TIER_CONFIG.map((tier) => ({
    ...tier,
    items: decisions.filter((d) => {
      const thisTierIdx = TIER_CONFIG.indexOf(tier);
      const nextTier = TIER_CONFIG[thisTierIdx - 1];
      return d.priority >= tier.min && (!nextTier || d.priority < nextTier.min);
    }),
  })).filter((t) => t.items.length > 0);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.metricsGrid}>
          {Array.from({ length: Object.keys(AgentMeta).length }, (_, i) => i + 1).map(i => <Skeleton key={i} variant="card" height={96} />)}
        </div>
        <Skeleton variant="rect" height={140} style={{ marginBottom: 'var(--space-6)' }} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className={styles.emptyActions}>
        <div className={styles.emptyActionsIcon}>Error</div>
        <div className={styles.emptyActionsTitle} style={{ color: 'var(--color-danger)' }}>{error}</div>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button size="sm" onClick={() => { setLoading(true); fetchData(); }}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Inline error banner for non-fatal errors */}
      {error && summary && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={() => setError(null)}>Dismiss</Button>
        </div>
      )}

      {/* Since Last Login Banner */}
      {sinceLoginSummary && (
        <div className={styles.sinceLoginBanner}>
          <div className={styles.sinceLoginIcon}>★</div>
          <div className={styles.sinceLoginText}>
            <strong>Since your last login:</strong> {sinceLoginSummary.text}
          </div>
          <span className={styles.sinceLoginCount}>{sinceLoginSummary.count} actions</span>
        </div>
      )}

      {/* Revenue Impact Header */}
      <div className={styles.metricsGrid}>
        <Stat label="Revenue at Risk" value={$$(revenueAtRisk)} sub="overdue invoices" color="red" />
        <Stat label="Pipeline Needs Action" value={$$(pipelineRequiringAction)} sub="pipeline value" color="amber" />
        <Stat label="Invoices Paid" value={$$(summary?.invoices?.paid || 0)} sub="collected" color="green" />
        <Stat label="Pending Approvals" value={pendingApprovals} sub="awaiting review" color="blue" />
        <Stat label="Agent Actions Today" value={agentActionsToday} sub="last 24h" color="purple" />
      </div>

      {/* Welcome empty state when workspace has no data yet */}
      {summary && (summary.contacts?.total || 0) === 0 && (summary.invoices?.total || 0) === 0 && (summary.deals?.total || 0) === 0 && (
        <div className={styles.emptyActions} style={{ marginBottom: "var(--space-4)" }}>
          <div className={styles.emptyActionsIcon}>A</div>
          <div className={styles.emptyActionsTitle}>Welcome to Autonome</div>
          <div className={styles.emptyActionsDesc}>Your 5 AI agents are ready. Create your first contact, deal, or invoice to activate them.</div>
        </div>
      )}

      {/* Live Activity Feed */}
      {activityFeed.length > 0 && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>LIVE</span>
            <span className={styles.sectionTitle}>Agent Activity Feed</span>
            <span className={styles.sectionCount}>{activityFeed.length} events</span>
          </div>
          <div className={styles.activityFeed}>
            {activityFeed.slice(0, 8).map((event) => {
              const meta = AgentMeta[event.agent] || { icon: "CMD", label: event.agent, color: T.mt, bg: "#F1F3F5" };
              const borderColor = AGENT_BORDER_COLORS[event.agent] || T.mt;
              return (
                <div key={event.id} className={styles.feedItem} style={{ borderLeftColor: borderColor }}>
                  <div className={styles.feedItemHeader}>
                    <div className={styles.feedItemAgent} style={{ background: meta.bg, color: meta.color }}>
                      {meta.icon}
                    </div>
                    <div className={styles.feedItemContent}>
                      <div className={styles.feedItemDesc}>{event.description}</div>
                      {event.entity_name && (
                        <div className={styles.feedItemMeta}>{event.entity_type} · {event.entity_name}</div>
                      )}
                      <div className={styles.feedItemPills}>
                        <Pill label={meta.label} variant={
                          event.agent === "finance" ? "green" :
                          event.agent === "revenue" ? "blue" :
                          event.agent === "operations" ? "amber" : "purple"
                        } />
                        {event.handed_off_to && (
                          <Pill label={`→ ${event.handed_off_to}`} variant="blue" />
                        )}
                      </div>
                    </div>
                    <span className={styles.feedItemTime}>{relativeTime(event.created_at)}</span>
                  </div>
                  {event.reasoning && (
                    <div>
                      <button
                        className={styles.reasoningToggle}
                        onClick={() => setExpandedReasoning(expandedReasoning === event.id ? null : event.id)}
                      >
                        {expandedReasoning === event.id ? "▲ Hide reasoning" : "▼ Why?"}
                      </button>
                      {expandedReasoning === event.id && (
                        <div className={styles.reasoningBox}>{event.reasoning}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-Entity Intelligence Alerts */}
      {insights.length > 0 && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag} style={{ color: T.am }}>INTEL</span>
            <span className={styles.sectionTitle}>Cross-Entity Alerts</span>
            <span className={styles.sectionCount}>{insights.length} insight{insights.length !== 1 ? "s" : ""}</span>
          </div>
          <div className={styles.insightsList}>
            {insights.map((insight, i) => (
              <div
                key={i}
                className={styles.insightItem}
                style={{
                  borderLeftColor:
                    insight.severity === "high" ? T.rd :
                    insight.severity === "medium" ? T.am : T.bl,
                }}
              >
                <div className={styles.insightTitle}>{insight.title}</div>
                <div className={styles.insightDesc}>{insight.description}</div>
                <div className={styles.insightPills}>
                  {insight.agents_involved.map((a) => {
                    const meta = AgentMeta[a] || { label: a };
                    return <Pill key={a} label={meta.label} variant="muted" />;
                  })}
                  <Pill
                    label={insight.severity}
                    variant={insight.severity === "high" ? "red" : insight.severity === "medium" ? "amber" : "blue"}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Briefing */}
      <div className={styles.briefingCard}>
        <div className={styles.briefingHeader} onClick={() => setShowBriefing((v) => !v)}>
          <div className={styles.briefingHeaderLeft}>
            <span className={styles.briefingTag}>BRIEF</span>
            <span className={styles.briefingTitle}>Business Overview</span>
          </div>
          <span className={styles.briefingToggle}>{showBriefing ? "▲ Hide" : "▼ Show"}</span>
        </div>
        {showBriefing && summary && (
          <div className={styles.briefingGrid}>
            {[
              { icon: "$", label: "Invoices Paid", val: $$(summary.invoices?.paid || 0) },
              { icon: "+", label: "Total Contacts", val: summary.contacts?.total || 0 },
              { icon: "!", label: "Invoices Pending", val: summary.invoices?.pending || 0 },
              { icon: "~", label: "Open Deals", val: summary.deals?.open || 0 },
              { icon: "x", label: "Tasks Done", val: summary.tasks?.done || 0 },
              { icon: ">", label: "Workflows Done", val: summary.workflows?.completed || 0 },
              { icon: "||", label: "Workflows Active", val: summary.workflows?.active || 0 },
              { icon: "!", label: "Need Approval", val: pendingApprovals },
            ].map((item) => (
              <div key={item.label} className={styles.briefingItem}>
                <span>{item.icon} </span>
                <span className={styles.briefingItemLabel}>{item.label}: </span>
                <strong className={styles.briefingItemVal}>{item.val}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Memory Highlights */}
      {agentMemory.length > 0 && (
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag} style={{ color: T.pu }}>MEMORY</span>
            <span className={styles.sectionTitle}>Agent Observations</span>
          </div>
          <div className={styles.memoryList}>
            {agentMemory.map((m) => {
              const meta = AgentMeta[m.agent] || { icon: "CMD", label: m.agent, color: T.mt, bg: "#F1F3F5" };
              return (
                <div key={m.id} className={styles.memoryItem}>
                  <div className={styles.memoryAgent} style={{ background: meta.bg, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div className={styles.memoryContent}>
                    <span className={styles.memoryAgentLabel}>{meta.label} learned: </span>
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activation Checklist (shown until all done and dismissed) */}
      {!checklistDismissed && checklist.length > 0 && (
        <div className={styles.checklistCard}>
          <div className={styles.checklistHeader}>
            <div className={styles.checklistHeaderLeft}>
              <span className={styles.checklistTag}>START</span>
              <span className={styles.checklistTitle}>Getting Started</span>
              <span className={styles.checklistCount}>
                {checklist.filter((c) => c.done).length}/{checklist.length} complete
              </span>
            </div>
            {checklistAllDone && (
              <Button variant="secondary" size="sm" onClick={() => setChecklistDismissed(true)}>
                Dismiss
              </Button>
            )}
          </div>
          <div className={styles.checklistBody}>
            {checklist.map((item) => (
              <div key={item.label} className={styles.checklistItem}>
                <span
                  className={styles.checklistIcon}
                  style={{ color: item.done ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                >
                  {item.done ? "[x]" : "[ ]"}
                </span>
                <span
                  className={styles.checklistItemLabel}
                  style={{ color: item.done ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Business Query */}
      <div className={styles.aiCard}>
        <div className={styles.aiTitle}>AI Ask Autonome</div>
        <div className={styles.aiRow}>
          <input
            className={styles.aiInput}
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAiQuery()}
            placeholder="e.g. Which invoices are most at risk? What should I focus on today?"
          />
          <Button size="sm" onClick={handleAiQuery} disabled={aiLoading || !aiQuery.trim()}>
            {aiLoading ? "…" : "Ask"}
          </Button>
        </div>
        {aiResponse && (
          <div className={styles.aiResponse}>{aiResponse}</div>
        )}
      </div>

      {/* Actions header */}
      <div className={styles.actionsHeader}>
        <h2 className={styles.actionsTitle}>
          Today's Priorities
          {decisions.length > 0 && (
            <span className={styles.actionsTitleCount}>
              {decisions.length} action{decisions.length !== 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button size="sm" onClick={handleTrigger} disabled={triggering}>
            {triggering ? "Running…" : "Run Agents Now"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowMissedCall(true)}>
            TEL Log Missed Call
          </Button>
        </div>
      </div>

      {/* Trigger result summary */}
      {triggerResult && (
        <div className={styles.briefingCard} style={{ marginBottom: "var(--space-4)" }}>
          <div className={styles.briefingGrid}>
            {[
              { icon: "+", label: "Decisions Generated", val: triggerResult.decisionsGenerated },
              { icon: ">", label: "Auto-Executed", val: triggerResult.decisionsAutoExecuted },
              { icon: "!", label: "Pending Approval", val: triggerResult.decisionsPending },
              { icon: "~", label: "Workflows Advanced", val: triggerResult.workflowsAdvanced },
              { icon: "@", label: "Emails Sent", val: triggerResult.emailsSent },
              { icon: "T", label: "SMS Sent", val: triggerResult.smsSent },
            ].map((item) => (
              <div key={item.label} className={styles.briefingItem}>
                <span>{item.icon} </span>
                <span className={styles.briefingItemLabel}>{item.label}: </span>
                <strong className={styles.briefingItemVal}>{item.val}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {decisions.length === 0 ? (
        <div className={styles.emptyActions}>
          <div className={styles.emptyActionsIcon}>[OK]</div>
          <div className={styles.emptyActionsTitle}>All clear</div>
          <div className={styles.emptyActionsDesc}>No priority actions right now. Agents are monitoring your business continuously.</div>
        </div>
      ) : (
        tiers.map((tier) => (
          <div key={tier.label} className={styles.tierSection}>
            <div className={styles.tierLabel} style={{ color: tier.color }}>
              <span className={styles.tierDot} style={{ background: tier.color }} />
              {tier.label}
            </div>
            {tier.items.map((decision) => {
              const meta = AgentMeta[decision.agent] || { icon: "CMD", label: decision.agent, color: 'var(--color-text-muted)', bg: 'var(--color-bg)' };
              const isRunning = executing === decision.id;
              const borderColor = AGENT_BORDER_COLORS[decision.agent] || tier.color;
              return (
                <div key={decision.id} className={styles.actionCard} style={{ borderLeftColor: borderColor }}>
                  <div
                    className={styles.actionAgent}
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div className={styles.actionContent}>
                    <div className={styles.actionDesc}>{decision.desc}</div>
                    <div className={styles.actionPills}>
                      <Pill
                        label={meta.label}
                        variant={
                          decision.agent === "finance" ? "green" :
                          decision.agent === "revenue" ? "blue" :
                          decision.agent === "operations" ? "amber" : "purple"
                        }
                      />
                      {decision.impact > 0 && (
                        <Pill label={`${$$(decision.impact)} impact`} variant="muted" />
                      )}
                      {decision.needsApproval && (
                        <Pill label="Needs Approval" variant="amber" />
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={decision.needsApproval ? "secondary" : "primary"}
                    disabled={isRunning}
                    onClick={() => handleExecute(decision)}
                  >
                    {isRunning ? "Running…" : decision.needsApproval ? "Approve & Run" : "Execute"}
                  </Button>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Missed Call Dialog */}
      {showMissedCall && (
        <Dialog
          title="Log Missed Call"
          onClose={() => setShowMissedCall(false)}
          onConfirm={handleMissedCall}
          confirmLabel="Log & Create Follow-up"
        >
          <Input label="Caller Name" value={callForm.name} onChange={(v) => setCallForm((f) => ({ ...f, name: v }))} placeholder="Unknown Caller" />
          <Input label="Phone Number" value={callForm.phone} onChange={(v) => setCallForm((f) => ({ ...f, phone: v }))} placeholder="+1 (555) 000-0000" />
          <Input label="Time of Call" type="time" value={callForm.time} onChange={(v) => setCallForm((f) => ({ ...f, time: v }))} />
          <Input label="Notes" value={callForm.note} onChange={(v) => setCallForm((f) => ({ ...f, note: v }))} placeholder="Any context about the call..." />
        </Dialog>
      )}
    </div>
  );
}

