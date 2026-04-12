import { useState, useEffect, useCallback } from "react";
import { T } from "../lib/theme.js";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import AgentMeta from "../components/AgentMeta.js";
import Input from "../components/Input.jsx";

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
      <div style={{ textAlign: "center", padding: 48, color: T.mt, fontSize: 14 }}>
        Loading dashboard…
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 48,
          background: T.rdL,
          borderRadius: 12,
          border: `1px solid ${T.rd}30`,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: T.rd, marginBottom: 8 }}>Error</div>
        <div style={{ fontSize: 13, color: T.tx, marginBottom: 12 }}>{error}</div>
        <Button size="sm" onClick={() => { setLoading(true); fetchData(); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Inline error banner for non-fatal errors */}
      {error && summary && (
        <div
          style={{
            background: T.rdL,
            border: `1px solid ${T.rd}30`,
            borderRadius: 8,
            padding: "8px 14px",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 13, color: T.rd }}>{error}</span>
          <Button size="sm" variant="secondary" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Revenue Impact Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Revenue at Risk", value: $$(revenueAtRisk), color: T.rd, sub: "overdue invoices" },
          { label: "Pipeline Needs Action", value: $$(pipelineRequiringAction), color: T.am, sub: "pipeline value" },
          { label: "Invoices Paid", value: $$(summary?.invoices?.paid || 0), color: T.gn, sub: "collected" },
          { label: "Pending Approvals", value: pendingApprovals, color: T.bl, sub: "awaiting review" },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: T.wh,
              border: `1px solid ${T.bd}`,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.tx, marginTop: 2 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: T.mt }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Daily Briefing */}
      <div
        style={{
          background: T.blL,
          border: `1px solid ${T.bl}30`,
          borderRadius: 12,
          marginBottom: 20,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            cursor: "pointer",
          }}
          onClick={() => setShowBriefing((v) => !v)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.bl }}>BRIEF</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.bl }}>Daily Briefing</span>
          </div>
          <span style={{ color: T.bl, fontSize: 12 }}>{showBriefing ? "▲ Hide" : "▼ Show"}</span>
        </div>
        {showBriefing && summary && (
          <div
            style={{
              padding: "0 16px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 8,
            }}
          >
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
              <div key={item.label} style={{ background: T.wh, borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 12 }}>{item.icon} </span>
                <span style={{ fontSize: 12, color: T.dm }}>{item.label}: </span>
                <strong style={{ fontSize: 12, color: T.tx }}>{item.val}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activation Checklist (shown until all done and dismissed) */}
      {!checklistDismissed && checklist.length > 0 && (
        <div
          style={{
            background: T.wh,
            border: `1px solid ${T.bd}`,
            borderRadius: 12,
            marginBottom: 20,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: `1px solid ${T.bd}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.tx }}>START</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>Getting Started</span>
              <span style={{ fontSize: 12, color: T.mt }}>
                {checklist.filter((c) => c.done).length}/{checklist.length} complete
              </span>
            </div>
            {checklistAllDone && (
              <Button variant="secondary" size="sm" onClick={() => setChecklistDismissed(true)}>
                Dismiss
              </Button>
            )}
          </div>
          <div style={{ padding: "10px 16px" }}>
            {checklist.map((item) => (
              <div
                key={item.label}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: item.done ? T.gn : T.mt, minWidth: 20 }}>{item.done ? "[x]" : "[ ]"}</span>
                <span style={{ fontSize: 13, color: item.done ? T.dm : T.tx }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Business Query */}
      <div
        style={{
          background: T.wh,
          border: `1px solid ${T.bd}`,
          borderRadius: 12,
          marginBottom: 20,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: T.tx, marginBottom: 10 }}>
          AI Ask Autonome
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAiQuery()}
            placeholder="e.g. Which invoices are most at risk? What should I focus on today?"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: `1px solid ${T.bd}`,
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: T.tx,
              background: T.bg,
              outline: "none",
            }}
          />
          <Button size="sm" onClick={handleAiQuery} disabled={aiLoading || !aiQuery.trim()}>
            {aiLoading ? "…" : "Ask"}
          </Button>
        </div>
        {aiResponse && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: T.blL,
              borderRadius: 8,
              fontSize: 13,
              color: T.tx,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {aiResponse}
          </div>
        )}
      </div>

      {/* Actions header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.tx }}>
          Today's Priorities
          {decisions.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: T.mt }}>
              {decisions.length} action{decisions.length !== 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <Button variant="secondary" size="sm" onClick={() => setShowMissedCall(true)}>
          TEL Log Missed Call
        </Button>
      </div>

      {decisions.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            background: T.gnL,
            borderRadius: 12,
            border: `1px solid ${T.gn}30`,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: T.gn, marginBottom: 8 }}>[OK]</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.gn }}>All clear</div>
          <div style={{ fontSize: 13, color: T.dm, marginTop: 4 }}>No priority actions right now.</div>
        </div>
      ) : (
        tiers.map((tier) => (
          <div key={tier.label} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: tier.color,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: tier.color,
                }}
              />
              {tier.label}
            </div>
            {tier.items.map((decision) => {
              const meta = AgentMeta[decision.agent] || { icon: "CMD", label: decision.agent, color: T.dm, bg: T.bg };
              const isRunning = executing === decision.id;
              return (
                <div
                  key={decision.id}
                  style={{
                    background: T.wh,
                    border: `1px solid ${T.bd}`,
                    borderRadius: 10,
                    padding: "12px 16px",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Agent icon */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: meta.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: meta.color,
                      letterSpacing: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    {meta.icon}
                  </div>

                  {/* Description */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{decision.desc}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <Pill label={meta.label} variant={decision.agent === "finance" ? "green" : decision.agent === "revenue" ? "blue" : decision.agent === "operations" ? "amber" : "purple"} />
                      {decision.impact > 0 && (
                        <Pill label={`${$$(decision.impact)} impact`} variant="muted" />
                      )}
                      {decision.needsApproval && (
                        <Pill label="Needs Approval" variant="amber" />
                      )}
                    </div>
                  </div>

                  {/* Execute button */}
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
