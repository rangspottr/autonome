import { useState } from "react";
import { T } from "../lib/theme.js";
import { uid, iso, $$, da } from "../lib/utils.js";
import { executiveDecisions } from "../lib/engine/decisions.js";
import { computeBriefing } from "../lib/engine/briefing.js";
import { executeAction } from "../lib/engine/execution.js";
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

function getTier(priority) {
  return TIER_CONFIG.find((t) => priority >= t.min) || TIER_CONFIG[3];
}

export default function CmdCenter({ db, onUpdate }) {
  const [showBriefing, setShowBriefing] = useState(true);
  const [executing, setExecuting] = useState(null);
  const [showMissedCall, setShowMissedCall] = useState(false);
  const [callForm, setCallForm] = useState({ phone: "", name: "", time: "", note: "" });
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  const decisions = executiveDecisions(db);
  const briefing = computeBriefing(db);

  // Revenue impact metrics
  const revenueAtRisk = (db.txns || [])
    .filter((t) => t.type === "inv" && t.st === "pending" && t.due && new Date(t.due) < new Date())
    .reduce((sum, t) => sum + (t.amt || 0), 0);

  const pipelineRequiringAction = (db.deals || [])
    .filter((d) => d.stage !== "closed" && da(d.at) >= 3)
    .reduce((sum, d) => sum + (d.val || 0), 0);

  const pendingApprovals = decisions.filter((d) => d.needsApproval && !d.auto).length;

  async function handleExecute(decision) {
    setExecuting(decision.target);
    try {
      const updated = await executeAction(db, decision);
      onUpdate(updated);
    } finally {
      setExecuting(null);
    }
  }

  function handleMissedCall() {
    const updated = JSON.parse(JSON.stringify(db));

    // Create lead contact
    const contact = {
      id: uid(),
      name: callForm.name || `Unknown (${callForm.phone})`,
      phone: callForm.phone,
      email: null,
      type: "lead",
      createdAt: iso(),
      tags: ["missed-call"],
    };
    updated.contacts = [...(updated.contacts || []), contact];

    // Create task
    const task = {
      id: uid(),
      title: `Call back: ${contact.name}`,
      desc: callForm.note,
      st: "todo",
      priority: "high",
      due: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      createdAt: iso(),
    };
    updated.tasks = [...(updated.tasks || []), task];

    // Create memory entry
    updated.memory = [
      ...(updated.memory || []),
      {
        id: uid(),
        at: iso(),
        contactId: contact.id,
        type: "missed_call",
        text: `Missed call at ${callForm.time || "unknown time"}. Note: ${callForm.note || "none"}`,
        agent: "operations",
        tags: ["missed-call", "follow-up"],
        sentiment: "neutral",
        source: "manual",
        linkedEntityId: task.id,
        linkedEntityType: "task",
      },
    ];

    // Audit
    updated.audit = [
      ...(updated.audit || []),
      { id: uid(), at: iso(), agent: "Operations", action: "missed_call", target: contact.id, desc: `Missed call logged: ${contact.name}`, auto: false, delivered: false },
    ];

    onUpdate(updated);
    setShowMissedCall(false);
    setCallForm({ phone: "", name: "", time: "", note: "" });
  }

  async function handleAiQuery() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiResponse(null);

    // Build business context for the query
    const overdueInvoices = (db.txns || []).filter(
      (t) => t.type === "inv" && t.st === "pending" && t.due && new Date(t.due) < new Date()
    );
    const totalRevenue = (db.txns || [])
      .filter((t) => t.type === "inc" && t.st === "paid")
      .reduce((s, t) => s + (t.amt || 0), 0);
    const totalExpenses = (db.txns || [])
      .filter((t) => t.type === "exp")
      .reduce((s, t) => s + (t.amt || 0), 0);
    const openDeals = (db.deals || []).filter((d) => d.stage !== "closed");
    const pipelineValue = openDeals.reduce((s, d) => s + (d.val || 0), 0);

    const context = `Business: ${db.cfg.name} (${db.cfg.type})
Revenue: $${Math.round(totalRevenue).toLocaleString()} | Expenses: $${Math.round(totalExpenses).toLocaleString()} | Net: $${Math.round(totalRevenue - totalExpenses).toLocaleString()}
Overdue invoices: ${overdueInvoices.length} totaling $${Math.round(overdueInvoices.reduce((s, t) => s + (t.amt || 0), 0)).toLocaleString()}
Open pipeline: ${openDeals.length} deals worth $${Math.round(pipelineValue).toLocaleString()}
Contacts: ${(db.contacts || []).length} | Tasks pending: ${(db.tasks || []).filter((t) => t.st !== "done").length}
Recent audit entries: ${(db.audit || []).slice(-5).map((a) => a.desc).join("; ")}`;

    const localSummary = `Business Snapshot for ${db.cfg.name}:
• Revenue collected: $${Math.round(totalRevenue).toLocaleString()}
• Expenses: $${Math.round(totalExpenses).toLocaleString()}
• Net cash position: $${Math.round(totalRevenue - totalExpenses).toLocaleString()}
• Overdue invoices: ${overdueInvoices.length} ($${Math.round(overdueInvoices.reduce((s, t) => s + (t.amt || 0), 0)).toLocaleString()} at risk)
• Open deals: ${openDeals.length} ($${Math.round(pipelineValue).toLocaleString()} pipeline)
• Pending tasks: ${(db.tasks || []).filter((t) => t.st !== "done").length}`;

    const llmKey = db.cfg.keys?.llm;
    if (!llmKey) {
      setAiResponse(localSummary);
      setAiLoading(false);
      return;
    }

    try {
      const model = db.cfg.llmModel || "claude-sonnet-4-20250514";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": llmKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `You are Autonome, an AI business operator assistant. Here is the current business context:\n\n${context}\n\nUser question: ${aiQuery}\n\nProvide a concise, actionable answer.`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiResponse(data.content?.[0]?.text || localSummary);
      } else {
        setAiResponse(localSummary);
      }
    } catch {
      setAiResponse(localSummary);
    } finally {
      setAiLoading(false);
    }
  }

  // Activation checklist items
  const checklist = [
    { label: "Add your first real contact", done: (db.contacts || []).some((c) => !c.tags?.includes("sample")) },
    { label: "Create an invoice", done: (db.txns || []).some((t) => t.type === "inv") },
    { label: "Set up a deal in the pipeline", done: (db.deals || []).length > 0 },
    { label: "Configure API keys (Settings)", done: !!(db.cfg.keys?.llm || db.cfg.keys?.gmail || db.cfg.keys?.stripe) },
    { label: "Review your first agent recommendation", done: (db.audit || []).length > 0 },
  ];
  const checklistAllDone = checklist.every((c) => c.done);

  // Group decisions by tier
  const tiers = TIER_CONFIG.map((tier) => ({
    ...tier,
    items: decisions.filter((d) => {
      const thisTierIdx = TIER_CONFIG.indexOf(tier);
      const nextTier = TIER_CONFIG[thisTierIdx - 1];
      return d.priority >= tier.min && (!nextTier || d.priority < nextTier.min);
    }),
  })).filter((t) => t.items.length > 0);

  return (
    <div>
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
          { label: "Pipeline Needs Action", value: $$(pipelineRequiringAction), color: T.am, sub: "stale ≥3 days" },
          { label: "Revenue Recovered", value: $$(db.outcomes?.collected || 0), color: T.gn, sub: "collected" },
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
            <span>📋</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.bl }}>Daily Briefing</span>
            {briefing.healthDelta !== 0 && (
              <Pill
                label={`Health ${briefing.healthDelta > 0 ? "+" : ""}${briefing.healthDelta}pts`}
                variant={briefing.healthDelta > 0 ? "green" : "red"}
              />
            )}
          </div>
          <span style={{ color: T.bl, fontSize: 12 }}>{showBriefing ? "▲ Hide" : "▼ Show"}</span>
        </div>
        {showBriefing && (
          <div
            style={{
              padding: "0 16px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 8,
            }}
          >
            {[
              { icon: "💰", label: "Collected Today", val: $$(briefing.collectedToday) },
              { icon: "👤", label: "New Leads", val: briefing.newLeads },
              { icon: "⚠️", label: "Newly Overdue", val: briefing.newlyOverdue },
              { icon: "📊", label: "Deals Advanced", val: briefing.dealsAdvanced },
              { icon: "✅", label: "Tasks Auto-Done", val: briefing.tasksAuto },
              { icon: "🔄", label: "Workflows Done", val: briefing.workflowsCompleted },
              { icon: "⏸️", label: "Workflows Paused", val: briefing.workflowsPaused },
              { icon: "🔔", label: "Need Approval", val: briefing.pendingApprovals },
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
      {!checklistDismissed && (
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
              <span>🚀</span>
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
                <span style={{ fontSize: 14 }}>{item.done ? "✅" : "⬜"}</span>
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
          🤖 Ask Autonome
          {!db.cfg.keys?.llm && (
            <span style={{ fontSize: 11, fontWeight: 400, color: T.mt, marginLeft: 8 }}>
              (Add LLM key in Settings for AI answers)
            </span>
          )}
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
          📞 Log Missed Call
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
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
              const meta = AgentMeta[decision.agent] || { icon: "🤖", label: decision.agent, color: T.dm, bg: T.bg };
              const isRunning = executing === decision.target;
              return (
                <div
                  key={`${decision.agent}-${decision.action}-${decision.target}`}
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
                      fontSize: 18,
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
