import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import Skeleton from "../components/Skeleton.jsx";
import styles from "./InboxOperatorView.module.css";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusDotClass(status) {
  if (status === "active") return styles.statusActive;
  if (status === "needs_attention") return styles.statusAttention;
  return styles.statusMonitoring;
}

function StatusLabel(status) {
  if (status === "active") return "Active — Monitoring";
  if (status === "needs_attention") return "Needs Attention";
  return "Monitoring";
}

export default function InboxOperatorView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/operator/inbox")
      .then((d) => setData(d))
      .catch((err) => setError(err.message || "Failed to load inbox operator"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.view}>
        <div className={styles.pageHeader}>
          <div>
            <h2 className={styles.pageTitle}>Inbox / Lead Operator</h2>
            <p className={styles.pageDesc}>Monitoring inbound leads, emails, forms, and missed calls.</p>
          </div>
        </div>
        <Skeleton variant="rect" height={60} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={100} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={200} />
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Inbox / Lead Operator</h2>
          <p className={styles.pageDesc}>Monitoring inbound leads, emails, forms, and missed calls.</p>
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
              <div className={styles.metricValue}>{data.metrics?.new_leads_7d ?? 0}</div>
              <div className={styles.metricLabel}>New Leads (7d)</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{data.metrics?.unprocessed_events ?? 0}</div>
              <div className={styles.metricLabel}>Unprocessed Events</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>{data.metrics?.open_deals ?? 0}</div>
              <div className={styles.metricLabel}>Open Deals</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricValue}>
                {data.metrics?.pipeline_value != null ? `$${Math.round(data.metrics.pipeline_value).toLocaleString()}` : "—"}
              </div>
              <div className={styles.metricLabel}>Pipeline Value</div>
            </div>
          </div>

          {/* Recent leads */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Recent Leads</div>
            {data.recent_leads?.length > 0 ? (
              data.recent_leads.map((lead) => (
                <div key={lead.id} className={styles.leadCard}>
                  <div>
                    <div className={styles.leadName}>{lead.name}</div>
                    <div className={styles.leadMeta}>
                      {lead.company && <span>{lead.company} · </span>}
                      {lead.email && <span>{lead.email} · </span>}
                      {formatDate(lead.created_at)}
                    </div>
                  </div>
                  <div className={styles.leadType}>{lead.type}</div>
                </div>
              ))
            ) : (
              <div className={styles.empty}>No new leads in the last 7 days.</div>
            )}
          </div>

          {/* Pipeline by stage */}
          {data.pipeline?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Pipeline</div>
              {data.pipeline.map((row) => (
                <div key={row.stage} className={styles.leadCard}>
                  <div>
                    <div className={styles.leadName}>{row.stage.charAt(0).toUpperCase() + row.stage.slice(1)}</div>
                    <div className={styles.leadMeta}>{row.count} deal{row.count !== "1" ? "s" : ""}</div>
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "var(--text-sm)" }}>
                    ${Math.round(parseFloat(row.total_value || 0)).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent agent actions */}
          {data.recent_actions?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Recent Agent Actions</div>
              {data.recent_actions.map((action, i) => (
                <div key={i} className={styles.actionCard}>
                  <span className={styles.actionAgent}>{action.agent?.charAt(0).toUpperCase() + (action.agent?.slice(1) || "")}</span>
                  {action.description || action.action_type}
                  <span style={{ color: "var(--color-text-muted)", marginLeft: 8, fontSize: 11 }}>{formatDate(action.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
