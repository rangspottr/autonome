import { useState, useEffect, useCallback } from "react";
import { T } from "../lib/theme.js";

import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Pill from "../components/Pill.jsx";

const AGENT_COLORS = {
  Finance: "green",
  Revenue: "blue",
  Operations: "amber",
  Growth: "purple",
  Support: "muted",
};

function descriptionFor(entry) {
  if (entry.details && typeof entry.details === "object") {
    if (entry.details.description) return entry.details.description;
    if (entry.details.desc) return entry.details.desc;
  }
  if (typeof entry.details === "string") return `${entry.action}: ${entry.details}`;
  return entry.action || "Unknown action";
}

function outcomeVariant(outcome) {
  if (!outcome) return "muted";
  const lower = outcome.toLowerCase();
  if (lower === "success" || lower === "delivered") return "green";
  if (lower === "failure" || lower === "error") return "red";
  return "muted";
}

export default function AuditView() {
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAudit = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get("/audit-log");
      setAudit(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const entries = [...audit].reverse();

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: T.mt, fontSize: 14 }}>
        Loading audit log…
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Audit Log</h2>
        <div style={{ fontSize: 13, color: T.dm }}>{entries.length} entries — all agent actions are logged here.</div>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#dc2626", flex: 1 }}>{error}</span>
          <button onClick={() => { setError(null); fetchAudit(); }} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      )}

      {entries.length === 0 && !error ? (
        <Card>
          <p style={{ color: T.mt, fontSize: 13, textAlign: "center", padding: 32 }}>
            No audit entries yet. Actions will appear here as agents execute.
          </p>
        </Card>
      ) : entries.length > 0 && (
        <Card>
          {entries.map((entry) => {
            const desc = descriptionFor(entry);
            const approvedBy = entry.details && entry.details.approvedBy;
            const isAuto = !approvedBy;
            const isDelivered = entry.outcome && entry.outcome.toLowerCase() === "delivered";

            return (
              <div key={entry.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.bd}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.tx }}>{desc}</div>
                    <div style={{ fontSize: 11, color: T.mt, marginTop: 2 }}>
                      {new Date(entry.created_at).toLocaleString()}
                      {approvedBy && ` · Approved by: ${approvedBy}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <Pill
                      label={entry.agent}
                      variant={AGENT_COLORS[entry.agent] || "muted"}
                    />
                    {isAuto && <Pill label="Auto" variant="muted" />}
                    {isDelivered && <Pill label="Delivered" variant="green" />}
                    {entry.outcome && !isDelivered && (
                      <Pill label={entry.outcome} variant={outcomeVariant(entry.outcome)} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
