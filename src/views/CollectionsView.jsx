import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Skeleton from "../components/Skeleton.jsx";
import styles from "./CollectionsView.module.css";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusDotClass(status) {
  if (status === "active") return styles.statusActive;
  if (status === "needs_attention") return styles.statusAttention;
  return styles.statusMonitoring;
}

function StatusLabel(status) {
  if (status === "active") return "Active — No Overdue Accounts";
  if (status === "needs_attention") return "Needs Attention";
  return "Monitoring";
}

export default function CollectionsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    api.get("/operator/collections")
      .then((d) => setData(d))
      .catch((err) => setError(err.message || "Failed to load collections operator"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function runScan() {
    setRunning(true);
    try {
      await api.post("/outputs/trigger/collections_summary", {});
      load();
    } catch (err) {
      setError(err.message || "Failed to run collections scan");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.view}>
        <div className={styles.pageHeader}>
          <div>
            <h2 className={styles.pageTitle}>Collections Operator</h2>
            <p className={styles.pageDesc}>Monitoring overdue invoices, sending reminders, and escalating aging accounts.</p>
          </div>
        </div>
        <Skeleton variant="rect" height={60} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={100} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  const overdue = data?.overdue_accounts || [];
  const escalated = overdue.filter((i) => i.status === "escalated");
  const atRisk = overdue.filter((i) => i.status === "overdue");

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Collections Operator</h2>
          <p className={styles.pageDesc}>Monitoring overdue invoices, sending reminders, and escalating aging accounts.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" loading={running} onClick={runScan}>
            {running ? "Running…" : "Run Collections Scan"}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--color-danger)", marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Status banner */}
          <div className={styles.statusBanner}>
            <div className={`${styles.statusDot} ${StatusDotClass(data.status)}`} />
            <div>
              <div className={styles.statusLabel}>{StatusLabel(data.status)}</div>
              <div className={styles.statusMsg}>{data.status_message}</div>
            </div>
          </div>

          {/* Metrics */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={`${styles.metricValue} ${data.metrics?.total_overdue_amount > 0 ? styles.metricValueDanger : ""}`}>
                ${Math.round(data.metrics?.total_overdue_amount || 0).toLocaleString()}
              </div>
              <div className={styles.metricLabel}>Total Overdue</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{data.metrics?.overdue_count ?? 0}</div>
              <div className={styles.metricLabel}>Overdue Invoices</div>
            </div>
            <div className={styles.metricCard}>
              <div className={`${styles.metricValue} ${data.metrics?.escalated_count > 0 ? styles.metricValueDanger : ""}`}>
                {data.metrics?.escalated_count ?? 0}
              </div>
              <div className={styles.metricLabel}>Escalated</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{data.metrics?.reminders_sent_7d ?? 0}</div>
              <div className={styles.metricLabel}>Reminders (7d)</div>
            </div>
          </div>

          {/* Escalated accounts */}
          {escalated.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>🔴 Escalated — Owner Action Required</div>
              {escalated.map((inv) => (
                <InvoiceCard key={inv.id} inv={inv} />
              ))}
            </div>
          )}

          {/* At-risk accounts */}
          {atRisk.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>🟡 Overdue — Reminders in Progress</div>
              {atRisk.map((inv) => (
                <InvoiceCard key={inv.id} inv={inv} />
              ))}
            </div>
          )}

          {overdue.length === 0 && (
            <div className={styles.section}>
              <div className={styles.empty}>✅ No overdue invoices. All accounts are current.</div>
            </div>
          )}

          {/* Recent actions */}
          {data.recent_actions?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Recent Collections Actions</div>
              {data.recent_actions.map((action, i) => (
                <div key={i} className={styles.actionCard}>
                  {action.description}
                  <span style={{ color: "var(--color-text-muted)", marginLeft: 8, fontSize: 11 }}>
                    {formatDate(action.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Latest summary */}
          {data.latest_summary && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Latest Collections Summary</div>
              <div className={styles.summaryBox}>
                {data.latest_summary.title} · {formatDate(data.latest_summary.created_at)}
                {"\n\nView the full report in Outputs → Collections."}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvoiceCard({ inv }) {
  const daysOverdue = inv.days_overdue != null ? Math.round(parseFloat(inv.days_overdue)) : null;
  const isEscalated = inv.status === "escalated";
  return (
    <div className={`${styles.invoiceCard} ${isEscalated ? styles.invoiceEscalated : ""}`}>
      <div>
        <div className={styles.invoiceContact}>{inv.contact_name || "Unknown"}</div>
        <div className={styles.invoiceMeta}>
          {inv.description || "Invoice"}{inv.due_date ? ` · due ${new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
        </div>
      </div>
      {daysOverdue != null && (
        <div className={`${styles.invoiceDays} ${isEscalated ? styles.daysEscalated : styles.daysOverdue}`}>
          {daysOverdue}d overdue
        </div>
      )}
      <div className={styles.invoiceAmount}>${Math.round(parseFloat(inv.amount || 0)).toLocaleString()}</div>
    </div>
  );
}
