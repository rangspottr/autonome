import { useState, useEffect, useCallback } from "react";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import styles from "./ApprovalView.module.css";

export default function ApprovalView({ onRefreshMetrics }) {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingIds, setProcessingIds] = useState(new Set());

  const fetchDecisions = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get("/agent/decisions");
      const pending = (data.pendingDecisions || []).filter((d) => d.needsApproval);
      setPendingApprovals(pending);
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
          <h2 className={styles.title}>Pending Approvals</h2>
          <div className={styles.subtitle}>
            {loading ? "Loading…" : `${pendingApprovals.length} action${pendingApprovals.length !== 1 ? "s" : ""} awaiting your review`}
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
          <div className={styles.emptyText}>No pending approvals</div>
        </div>
      ) : (
        <div className={styles.list}>
          {pendingApprovals.map((decision) => {
            const meta = AgentMeta[decision.agent] || { icon: "CMD", label: decision.agent, color: "var(--color-text-muted)", bg: "var(--color-bg)" };
            const isProcessing = processingIds.has(decision.id);
            return (
              <div key={decision.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div
                    className={styles.agentBadge}
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardDesc}>{decision.desc}</div>
                    <div className={styles.cardMeta}>Agent: {meta.label} · Priority: {decision.priority}</div>
                  </div>
                </div>
                <div className={styles.cardPills}>
                  <Pill label={meta.label} variant="blue" />
                  {decision.impact > 0 && (
                    <Pill label={`${$$(decision.impact)} expected impact`} variant="green" />
                  )}
                  <Pill label={`Priority: ${decision.priority}`} variant="amber" />
                </div>
                <div className={styles.cardActions}>
                  <Button onClick={() => approve(decision)} size="sm" disabled={isProcessing}>
                    {isProcessing ? "Processing…" : "Approve"}
                  </Button>
                  <Button variant="secondary" onClick={() => reject(decision)} size="sm" disabled={isProcessing}>
                    {isProcessing ? "Processing…" : "Reject"}
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
