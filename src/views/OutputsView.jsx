import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Skeleton from "../components/Skeleton.jsx";
import styles from "./OutputsView.module.css";

const OUTPUT_TYPES = [
  { id: "", label: "All Outputs" },
  { id: "morning_briefing", label: "Morning Briefings" },
  { id: "weekly_report", label: "Weekly Reports" },
  { id: "collections_summary", label: "Collections" },
  { id: "inbox_summary", label: "Inbox" },
];

const TYPE_LABELS = {
  morning_briefing: "Morning Briefing",
  weekly_report: "Weekly Report",
  collections_summary: "Collections Summary",
  inbox_summary: "Inbox Summary",
};

const TRIGGER_TYPES = [
  { id: "morning_briefing", label: "Generate Morning Briefing" },
  { id: "weekly_report", label: "Generate Weekly Report" },
  { id: "collections_summary", label: "Run Collections Scan" },
];

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

export default function OutputsView() {
  const [activeType, setActiveType] = useState("");
  const [outputs, setOutputs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedFull, setSelectedFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [triggering, setTriggering] = useState(null);
  const [error, setError] = useState(null);

  const fetchOutputs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = activeType ? `?type=${activeType}&limit=20` : "?limit=20";
      const data = await api.get(`/outputs${params}`);
      const list = data.outputs || [];
      setOutputs(list);
      // Auto-select first item; use functional update to avoid stale closure on selected
      if (list.length > 0) {
        setSelected((prev) => prev ?? list[0]);
      }
    } catch (err) {
      setError(err.message || "Failed to load outputs");
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  useEffect(() => {
    if (!selected) return;
    setLoadingDetail(true);
    api.get(`/outputs/${selected.id}`)
      .then((data) => setSelectedFull(data))
      .catch(() => setSelectedFull(null))
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  async function triggerOutput(type) {
    setTriggering(type);
    try {
      await api.post(`/outputs/trigger/${type}`, {});
      await fetchOutputs();
    } catch (err) {
      setError(err.message || `Failed to generate ${type}`);
    } finally {
      setTriggering(null);
    }
  }

  function handleSelect(output) {
    setSelected(output);
    setSelectedFull(null);
  }

  const hasOutputs = outputs.length > 0;

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Finished Outputs</h2>
          <p className={styles.pageDesc}>
            Briefings, reports, and summaries produced automatically by your AI team.
          </p>
        </div>
      </div>

      {/* Type filter bar */}
      <div className={styles.typeBar}>
        {OUTPUT_TYPES.map((t) => (
          <button
            key={t.id}
            className={`${styles.typeBtn} ${activeType === t.id ? styles.typeBtnActive : ""}`}
            onClick={() => { setActiveType(t.id); setSelected(null); setSelectedFull(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Trigger row */}
      <div className={styles.triggerRow}>
        {TRIGGER_TYPES.map((t) => (
          <Button
            key={t.id}
            variant="secondary"
            size="sm"
            loading={triggering === t.id}
            onClick={() => triggerOutput(t.id)}
          >
            {triggering === t.id ? "Generating…" : `+ ${t.label}`}
          </Button>
        ))}
      </div>

      {error && (
        <div style={{ color: "var(--color-danger)", marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <Skeleton variant="rect" height={80} style={{ marginBottom: 12 }} />
          <Skeleton variant="rect" height={80} style={{ marginBottom: 12 }} />
          <Skeleton variant="rect" height={80} />
        </div>
      ) : !hasOutputs ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📄</div>
          <h3 className={styles.emptyTitle}>No outputs yet</h3>
          <p className={styles.emptyDesc}>
            Your AI team will automatically produce morning briefings, weekly reports, and collections summaries.
            Click one of the buttons above to generate your first output now.
          </p>
        </div>
      ) : (
        <div className={styles.outputGrid}>
          {/* Output list */}
          <div className={styles.outputList}>
            {outputs.map((out) => (
              <div
                key={out.id}
                className={`${styles.outputCard} ${selected?.id === out.id ? styles.outputCardActive : ""}`}
                onClick={() => handleSelect(out)}
              >
                <div className={styles.outputCardType}>{TYPE_LABELS[out.output_type] || out.output_type}</div>
                <div className={styles.outputCardTitle}>{out.title}</div>
                <div className={styles.outputCardMeta}>{formatDate(out.created_at)}</div>
              </div>
            ))}
          </div>

          {/* Output detail */}
          {!selected ? (
            <div className={styles.noSelection}>Select an output to view</div>
          ) : loadingDetail ? (
            <div className={styles.outputDetail}>
              <Skeleton variant="rect" height={400} />
            </div>
          ) : selectedFull ? (
            <div className={styles.outputDetail}>
              <div className={styles.detailHeader}>
                <div>
                  <div className={styles.detailType}>{TYPE_LABELS[selectedFull.output_type] || selectedFull.output_type}</div>
                  <h3 className={styles.detailTitle}>{selectedFull.title}</h3>
                  <div className={styles.detailMeta}>Generated {formatDate(selectedFull.created_at)}</div>
                </div>
                <div className={styles.detailActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([selectedFull.content || ""], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedFull.title || "output"}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export
                  </Button>
                </div>
              </div>

              {selectedFull.data && Object.keys(selectedFull.data).length > 0 && (
                <MetricRow data={selectedFull.data} type={selectedFull.output_type} />
              )}

              <div
                className={styles.detailContent}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedFull.content || "") }}
              />
            </div>
          ) : (
            <div className={styles.noSelection}>Could not load output.</div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricRow({ data, type }) {
  if (type === "morning_briefing") {
    const metrics = [
      { label: "Overdue Invoices", value: data.overdue_invoices ?? "—" },
      { label: "Pending Approvals", value: data.pending_approvals ?? "—" },
      { label: "Stale Deals", value: data.stale_deals ?? "—" },
      { label: "New Leads", value: data.new_leads ?? "—" },
    ];
    return <MetricCards metrics={metrics} />;
  }
  if (type === "weekly_report") {
    const metrics = [
      { label: "Revenue Collected", value: data.revenue_collected != null ? `$${Math.round(data.revenue_collected).toLocaleString()}` : "—" },
      { label: "Overdue", value: data.revenue_overdue != null ? `$${Math.round(data.revenue_overdue).toLocaleString()}` : "—" },
      { label: "Tasks Done", value: data.tasks_completed ?? "—" },
      { label: "Agent Actions", value: data.agent_actions ?? "—" },
    ];
    return <MetricCards metrics={metrics} />;
  }
  if (type === "collections_summary") {
    const metrics = [
      { label: "Total Overdue", value: data.total_overdue != null ? `$${Math.round(data.total_overdue).toLocaleString()}` : "—" },
      { label: "Accounts", value: data.overdue_count ?? "—" },
      { label: "Escalated", value: data.escalated_count ?? "—" },
      { label: "Reminders Sent", value: data.reminders_sent ?? "—" },
    ];
    return <MetricCards metrics={metrics} />;
  }
  return null;
}

function MetricCards({ metrics }) {
  return (
    <div className={styles.metricRow} style={{ marginBottom: "var(--space-4)" }}>
      {metrics.map((m) => (
        <div key={m.label} className={styles.metricCard}>
          <div className={styles.metricValue}>{m.value}</div>
          <div className={styles.metricLabel}>{m.label}</div>
        </div>
      ))}
    </div>
  );
}
