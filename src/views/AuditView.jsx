import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Pill from "../components/Pill.jsx";
import Table from "../components/Table.jsx";
import styles from "./AuditView.module.css";

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

  const columns = [
    {
      key: "created_at", label: "Date", sortable: true,
      render: (v) => new Date(v).toLocaleString(),
    },
    {
      key: "_desc", label: "Action",
      render: (_, row) => {
        const desc = descriptionFor(row);
        const approvedBy = row.details && row.details.approvedBy;
        return (
          <div>
            <div className={styles.entryDesc}>{desc}</div>
            {approvedBy && <div className={styles.entryMeta}>Approved by: {approvedBy}</div>}
          </div>
        );
      },
    },
    {
      key: "agent", label: "Agent",
      render: (v) => <Pill label={v} variant={AGENT_COLORS[v] || "muted"} />,
    },
    {
      key: "_badges", label: "Outcome",
      render: (_, row) => {
        const isAuto = !(row.details && row.details.approvedBy);
        const isDelivered = row.outcome && row.outcome.toLowerCase() === "delivered";
        return (
          <div className={styles.pills}>
            {isAuto && <Pill label="Auto" variant="muted" />}
            {isDelivered && <Pill label="Delivered" variant="green" />}
            {row.outcome && !isDelivered && (
              <Pill label={row.outcome} variant={outcomeVariant(row.outcome)} />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Audit Log</h2>
          <div className={styles.pageSubtitle}>{entries.length} entries — all agent actions are logged here.</div>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.errorClose} onClick={() => { setError(null); fetchAudit(); }}>Retry</button>
        </div>
      )}

      <Card>
        <Table
          columns={columns}
          data={entries}
          loading={loading}
          emptyIcon="📋"
          emptyTitle="No audit entries yet"
          emptyDescription="Actions will appear here as agents execute."
        />
      </Card>
    </div>
  );
}
