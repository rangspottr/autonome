import { useState, useEffect, useCallback } from "react";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Skeleton from "../components/Skeleton.jsx";
// eslint-disable-next-line no-unused-vars
import EmptyState from "../components/EmptyState.jsx";
import styles from "./ApprovalView.module.css";


const TRIGGER_LABELS = {
  finance: (d) => {
    if (d.impact > 0) return `$${Math.round(d.impact).toLocaleString()} at risk`;
    return null;
  },
  revenue: (d) => {
    if (d.impact > 0) return `$${Math.round(d.impact).toLocaleString()} pipeline value`;
    return null;
  },
  operations: (d) => d.desc || null,
  support: (d) => d.desc || null,
  growth: (d) => d.desc || null,
};

function getTriggerContext(decision) {
  const fn = TRIGGER_LABELS[decision.agent];
  return fn ? fn(decision) : null;
}

function getPriorityColor(priority) {
  if (priority >= 90) return "var(--color-danger)";
  if (priority >= 70) return "var(--color-warning)";
  return "var(--color-text-muted)";
}

function buildFallbackReasoning(decision, meta) {
  const agentLabel = `${meta.label} Agent`;
  const action = decision.action ? ` recommends ${decision.action}` : " recommends this action";
  const target = decision.targetName ? ` on ${decision.targetName}` : "";
  const impact = decision.impact > 0 ? ` with ${$$(decision.impact)} potential impact` : "";
  return `${agentLabel}${action}${target}${impact}.`;
}

export default function ApprovalView({ onRefreshMetrics }) {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());

  function toggleReasoning(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fetchDecisions = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get("/agent/decisions");
      const pending = (data.pendingDecisions || []).filter((d) => d.needsApproval);
      setPendingApprovals(pending);
      // Auto-expand reasoning for high-priority decisions
      const highPriorityIds = pending
        .filter((d) => (d.priority || 50) >= 70)
        .map((d) => d.id);
      if (highPriorityIds.length > 0) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          highPriorityIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch (err) {
      setError(err.message || "Failed to load decisions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  async function approve(decision) {
    setProcessingIds((prev) => new Set(prev).add(decision.id));
    try {
      await api.post("/agent/approve/" + decision.id, {
        agent: decision.agent,
        action: decision.action,
        target: decision.target,
        targetName: decision.targetName,
        contactId: decision.contactId,
        desc: decision.desc,
        impact: decision.impact,
      });
      await fetchDecisions();
      onRefreshMetrics?.();
    } catch (err) {
      setError(err.message || "Failed to approve");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(decision.id);
        return next;
      });
    }
  }

  async function reject(decision) {
    setProcessingIds((prev) => new Set(prev).add(decision.id));
    try {
      await api.post("/agent/reject/" + decision.id, {
        agent: decision.agent,
        action: decision.action,
        target: decision.target,
        targetName: decision.targetName,
      });
      await fetchDecisions();
      onRefreshMetrics?.();
    } catch (err) {
      setError(err.message || "Failed to reject");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(decision.id);
        return next;
      });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Decisions Awaiting Your Review</h2>
          <div className={styles.subtitle}>
            {loading ? "Loading…" : `${pendingApprovals.length} decision${pendingApprovals.length !== 1 ? "s" : ""} need your approval`}
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className={styles.list}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.card}>
              <Skeleton variant="rect" height={80} />
            </div>
          ))}
        </div>
      ) : pendingApprovals.length === 0 ? (
        <div className={styles.emptyCard}>
          <div className={styles.emptyIcon}>✓</div>
          <div className={styles.emptyText}>All clear — your agents have no decisions pending your review.</div>
        </div>
      ) : (
        <div className={styles.list}>
          {pendingApprovals.map((decision) => {
            const meta = AgentMeta[decision.agent] || { icon: "CMD", label: decision.agent, color: "var(--color-text-muted)", bg: "var(--color-bg)" };
            const isProcessing = processingIds.has(decision.id);
            const isExpanded = expandedIds.has(decision.id);
            const triggerCtx = getTriggerContext(decision);
            const priorityColor = getPriorityColor(decision.priority || 50);

            return (
              <div key={decision.id} className={styles.card}>
                {/* Header row */}
                <div className={styles.cardHeader}>
                  <div
                    className={styles.agentBadge}
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardDesc}>{decision.desc}</div>
                    <div className={styles.cardMeta}>
                      <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label} Agent</span>
                      {decision.targetName && (
                        <span> · <span className={styles.entityRef}>{decision.targetName}</span></span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Trigger context — why this needs approval */}
                {triggerCtx && (
                  <div className={styles.triggerContext}>
                    <span className={styles.triggerLabel}>Why now:</span>
                    <span>{triggerCtx}</span>
                  </div>
                )}

                {/* Impact indicator */}
                {decision.impact > 0 && (
                  <div className={styles.impactRow}>
                    <span className={styles.impactLabel}>Financial Impact:</span>
                    <span className={styles.impactValue} style={{ color: priorityColor }}>
                      {$$(decision.impact)} at risk
                    </span>
                  </div>
                )}

                {/* Pills */}
                <div className={styles.cardPills}>
                  <Pill label={meta.label} variant="blue" />
                  {decision.impact > 0 && (
                    <Pill label={`${$$(decision.impact)} impact`} variant="green" />
                  )}
                  <Pill
                    label={`P${Math.round(decision.priority || 50)}`}
                    variant={decision.priority >= 90 ? "red" : decision.priority >= 70 ? "amber" : "muted"}
                  />
                </div>

                {/* Expandable reasoning — always shown */}
                <div>
                  <button
                    className={styles.reasoningToggle}
                    onClick={() => toggleReasoning(decision.id)}
                  >
                    {isExpanded ? "▲ Hide agent reasoning" : "▼ Why is this recommended?"}
                  </button>
                  {isExpanded && (
                    <div
                      className={styles.reasoningBox}
                      style={{ borderLeftColor: meta.color }}
                    >
                      <div className={styles.reasoningLabel}>Agent Reasoning</div>
                      <p className={styles.reasoningText}>
                        {decision.reasoning || buildFallbackReasoning(decision, meta)}
                      </p>
                      {decision.agent && (
                        <div className={styles.reasoningMeta}>
                          Recommended by: <strong>{meta.label} Agent</strong>
                        </div>
                      )}
                      {(decision.agent === "finance" || decision.agent === "revenue") && decision.impact > 0 && (
                        <div className={styles.consequenceLine}>
                          If not addressed: {$$(decision.impact)} remains at risk.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className={styles.cardActions}>
                  <Button onClick={() => approve(decision)} size="sm" disabled={isProcessing}>
                    {isProcessing ? "Processing…" : "✓ Approve"}
                  </Button>
                  <Button variant="secondary" onClick={() => reject(decision)} size="sm" disabled={isProcessing}>
                    {isProcessing ? "Processing…" : "✕ Reject"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
