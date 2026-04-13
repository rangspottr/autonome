import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta, { DEFAULT_AGENT_META } from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import styles from "./AlertsView.module.css";

const SEVERITY_CONFIG = {
  critical: { label: "Critical", variant: "red", order: 1 },
  high: { label: "High", variant: "amber", order: 2 },
  medium: { label: "Medium", variant: "blue", order: 3 },
  low: { label: "Low", variant: "muted", order: 4 },
};

const TYPE_ICONS = {
  risk: "⚠️",
  opportunity: "💡",
  blocker: "🚫",
  escalation: "⬆️",
  digest: "📊",
};

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsView() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [actioning, setActioning] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterAgent) params.set("agent", filterAgent);
      if (filterSeverity) params.set("severity", filterSeverity);
      params.set("limit", "100");

      const [alertsData, statsData] = await Promise.all([
        api.get(`/proactive-alerts?${params}`),
        api.get("/proactive-alerts/stats"),
      ]);

      setAlerts(alertsData.alerts || []);
      setStats(statsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterSeverity]);

  useEffect(() => {
    setLoading(true);
    fetchAlerts();
  }, [fetchAlerts]);

  async function handleAction(alertId, action) {
    setActioning(alertId + action);
    try {
      await api.post(`/proactive-alerts/${alertId}/${action}`, {});
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      // ignore
    } finally {
      setActioning(null);
    }
  }

  const agentList = ["finance", "revenue", "operations", "growth", "support"];

  const totalActive = alerts.length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className={styles.view}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Proactive Alerts</h2>
          <p className={styles.pageDesc}>
            Risks, opportunities, and blockers detected automatically by agents.
          </p>
        </div>
        <div className={styles.headerStats}>
          {criticalCount > 0 && (
            <span className={styles.criticalBadge}>
              🚨 {criticalCount} critical
            </span>
          )}
          <span className={styles.totalBadge}>{totalActive} active</span>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className={styles.statsRow}>
          {(stats.bySeverity || []).map((s) => {
            const cfg = SEVERITY_CONFIG[s.severity] || SEVERITY_CONFIG.low;
            return (
              <button
                key={s.severity}
                className={[styles.statCard, filterSeverity === s.severity ? styles.statCardActive : ""].join(" ")}
                onClick={() => setFilterSeverity(filterSeverity === s.severity ? "" : s.severity)}
              >
                <span className={styles.statCount}>{s.count}</span>
                <Pill label={cfg.label} variant={cfg.variant} size="sm" />
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          aria-label="Filter by agent"
        >
          <option value="">All agents</option>
          {agentList.map((a) => (
            <option key={a} value={a}>
              {(AgentMeta[a] || DEFAULT_AGENT_META).label}
            </option>
          ))}
        </select>

        <select
          className={styles.filterSelect}
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {(filterAgent || filterSeverity) && (
          <button
            className={styles.clearBtn}
            onClick={() => { setFilterAgent(""); setFilterSeverity(""); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Alerts list */}
      {loading ? (
        <div className={styles.loading}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.loadingCard} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.error}>Could not load alerts: {error}</div>
      ) : alerts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <div className={styles.emptyTitle}>No active alerts</div>
          <div className={styles.emptyDesc}>
            Agents are monitoring your business. Risks and opportunities will appear here automatically.
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {alerts.map((alert) => {
            const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
            const agentMeta = AgentMeta[alert.agent] || DEFAULT_AGENT_META;
            const typeIcon = TYPE_ICONS[alert.alert_type] || "📌";

            return (
              <div
                key={alert.id}
                className={[styles.alertCard, styles[`severity_${alert.severity}`]].join(" ")}
              >
                <div className={styles.alertHeader}>
                  <div className={styles.alertMeta}>
                    <span className={styles.typeIcon} aria-hidden="true">{typeIcon}</span>
                    <div
                      className={styles.agentBadge}
                      style={{ background: agentMeta.bg, color: agentMeta.color }}
                    >
                      {agentMeta.icon}
                    </div>
                    <span className={styles.agentLabel}>{agentMeta.label}</span>
                    <Pill label={cfg.label} variant={cfg.variant} size="sm" />
                    <span className={styles.alertType}>{alert.alert_type}</span>
                  </div>
                  <span className={styles.alertTime}>{relativeTime(alert.created_at)}</span>
                </div>

                <div className={styles.alertTitle}>{alert.title}</div>
                {alert.description && (
                  <div className={styles.alertDesc}>{alert.description}</div>
                )}

                <div className={styles.alertActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAction(alert.id, "acknowledge")}
                    loading={actioning === alert.id + "acknowledge"}
                    disabled={!!actioning}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(alert.id, "dismiss")}
                    loading={actioning === alert.id + "dismiss"}
                    disabled={!!actioning}
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAction(alert.id, "resolve")}
                    loading={actioning === alert.id + "resolve"}
                    disabled={!!actioning}
                  >
                    Resolve
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
