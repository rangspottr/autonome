import { useState, useEffect, useCallback } from "react";
import { T } from "../lib/theme.js";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";

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

  if (loading) {
    return (
      <div>
        <div style={{ textAlign: "center", padding: 32, color: T.dm, fontSize: 14 }}>
          Loading approvals…
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>
          Pending Approvals
        </h2>
        <div style={{ fontSize: 13, color: T.dm }}>
          {pendingApprovals.length} action{pendingApprovals.length !== 1 ? "s" : ""} awaiting your review
        </div>
      </div>

      {error && (
        <Card>
          <div style={{ textAlign: "center", padding: 16, color: T.rd, fontSize: 14, fontWeight: 600 }}>
            {error}
          </div>
        </Card>
      )}

      {pendingApprovals.length === 0 && !error ? (
        <Card>
          <div style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.gn, marginBottom: 8 }}>[OK]</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.gn }}>No pending approvals</div>
          </div>
        </Card>
      ) : (
        pendingApprovals.map((decision) => {
          const meta = AgentMeta[decision.agent] || { icon: "CMD", label: decision.agent, color: T.dm, bg: T.bg };
          const isProcessing = processingIds.has(decision.id);
          return (
            <Card key={decision.id}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 4 }}>
                    {decision.desc}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <Pill label={meta.label} variant="blue" />
                    {decision.impact > 0 && (
                      <Pill label={`${$$(decision.impact)} expected impact`} variant="green" />
                    )}
                    <Pill label={`Priority: ${decision.priority}`} variant="amber" />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button onClick={() => approve(decision)} size="sm" disabled={isProcessing}>
                      {isProcessing ? "Processing…" : "Approve"}
                    </Button>
                    <Button variant="secondary" onClick={() => reject(decision)} size="sm" disabled={isProcessing}>
                      {isProcessing ? "Processing…" : "Reject"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
