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

const TIER_CONFIG = [
  { label: "Money at Risk", min: 90, color: T.rd, bg: T.rdL, pillVariant: "red" },
  { label: "Revenue Opportunities", min: 70, color: T.bl, bg: T.blL, pillVariant: "blue" },
  { label: "Operational Health", min: 50, color: T.am, bg: T.amL, pillVariant: "amber" },
  { label: "Optimization", min: 0, color: T.mt, bg: "#F1F3F5", pillVariant: "muted" },
];

export default function CmdCenter({ onRefreshMetrics }) {
  const [decisions, setDecisions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showBriefing, setShowBriefing] = useState(true);
  const [executing, setExecuting] = useState(null);
  const [showMissedCall, setShowMissedCall] = useState(false);
  const [callForm, setCallForm] = useState({ phone: "", name: "", time: "", note: "" });
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived metrics from summary
  const revenueAtRisk = summary?.invoices?.outstanding || 0;
  const pipelineRequiringAction = summary?.deals?.pipelineValue || 0;
  const pendingApprovals = decisions.filter((d) => d.needsApproval && !d.auto).length;

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
          {[1,2,3,4].map(i => <Skeleton key={i} variant="card" height={96} />)}
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

      {/* Revenue Impact Header */}
      <div className={styles.metricsGrid}>
        <Stat label="Revenue at Risk" value={$$(revenueAtRisk)} sub="overdue invoices" color="red" />
        <Stat label="Pipeline Needs Action" value={$$(pipelineRequiringAction)} sub="pipeline value" color="amber" />
        <Stat label="Invoices Paid" value={$$(summary?.invoices?.paid || 0)} sub="collected" color="green" />
        <Stat label="Pending Approvals" value={pendingApprovals} sub="awaiting review" color="blue" />
      </div>

      {/* Daily Briefing */}
      <div className={styles.briefingCard}>
        <div className={styles.briefingHeader} onClick={() => setShowBriefing((v) => !v)}>
          <div className={styles.briefingHeaderLeft}>
            <span className={styles.briefingTag}>BRIEF</span>
            <span className={styles.briefingTitle}>Daily Briefing</span>
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
        <Button variant="secondary" size="sm" onClick={() => setShowMissedCall(true)}>
          TEL Log Missed Call
        </Button>
      </div>

      {decisions.length === 0 ? (
        <div className={styles.emptyActions}>
          <div className={styles.emptyActionsIcon}>[OK]</div>
          <div className={styles.emptyActionsTitle}>All clear</div>
          <div className={styles.emptyActionsDesc}>No priority actions right now.</div>
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
              return (
                <div key={decision.id} className={styles.actionCard}>
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
