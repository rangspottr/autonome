import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import AgentMeta, { DEFAULT_AGENT_META } from "./AgentMeta.js";
import styles from "./SinceLastLogin.module.css";

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

export default function SinceLastLogin({ onDismiss }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const result = await api.get("/activity/since-last-login");
        if (result.hasActivity || result.newAlerts?.length > 0 || result.pendingDecisions?.length > 0) {
          setData(result);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !data) return null;

  const totalActions = data.agentActivity?.reduce(
    (sum, r) => sum + (parseInt(r.action_count) || 0),
    0
  ) || 0;
  const criticalAlerts = data.newAlerts?.filter(
    (a) => a.severity === "critical" || a.severity === "high"
  ) || [];

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon} aria-hidden="true">⚡</span>
          <div>
            <div className={styles.headerTitle}>Since you were away</div>
            <div className={styles.headerSub}>
              {relativeTime(data.since)} ·{" "}
              {totalActions} action{totalActions !== 1 ? "s" : ""} taken
              {data.businessEventsProcessed > 0
                ? ` · ${data.businessEventsProcessed} event${data.businessEventsProcessed !== 1 ? "s" : ""} processed`
                : ""}
            </div>
          </div>
        </div>
        {onDismiss && (
          <button className={styles.dismissBtn} onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>

      {/* Critical alerts */}
      {criticalAlerts.length > 0 && (
        <div className={styles.alertsBanner}>
          <span className={styles.alertsIcon} aria-hidden="true">🚨</span>
          <span>
            {criticalAlerts.length} critical alert{criticalAlerts.length !== 1 ? "s" : ""} need your attention:
          </span>
          <div className={styles.alertsList}>
            {criticalAlerts.slice(0, 3).map((a) => (
              <div key={a.id} className={styles.alertItem}>
                <span className={styles.alertSeverity} data-severity={a.severity}>
                  {a.severity.toUpperCase()}
                </span>
                {a.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent activity breakdown */}
      {data.agentActivity && data.agentActivity.length > 0 && (
        <div className={styles.agents}>
          {data.agentActivity
            .filter((r) => parseInt(r.action_count) > 0)
            .map((r) => {
              const meta = AgentMeta[r.agent] || DEFAULT_AGENT_META;
              const isExpanded = expanded[r.agent];
              const agentAlerts = data.newAlerts?.filter((a) => a.agent === r.agent) || [];
              return (
                <div key={r.agent} className={styles.agentRow}>
                  <button
                    className={styles.agentHeader}
                    onClick={() => setExpanded((prev) => ({ ...prev, [r.agent]: !isExpanded }))}
                    aria-expanded={isExpanded}
                  >
                    <div
                      className={styles.agentAvatar}
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <div className={styles.agentInfo}>
                      <span className={styles.agentLabel}>{meta.label}</span>
                      <span className={styles.agentStats}>
                        {r.action_count} action{r.action_count !== 1 ? "s" : ""}
                        {r.handoff_count > 0 ? ` · ${r.handoff_count} handoff${r.handoff_count !== 1 ? "s" : ""}` : ""}
                        {r.blocked_count > 0 ? ` · ${r.blocked_count} blocked` : ""}
                        {agentAlerts.length > 0 ? ` · ${agentAlerts.length} alert${agentAlerts.length !== 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                    <span className={styles.chevron}>{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {isExpanded && agentAlerts.length > 0 && (
                    <div className={styles.agentAlerts}>
                      {agentAlerts.map((a) => (
                        <div key={a.id} className={styles.agentAlertItem}>
                          <span className={styles.alertSeverity} data-severity={a.severity}>
                            {a.severity}
                          </span>
                          {a.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Pending decisions */}
      {data.pendingDecisions && data.pendingDecisions.length > 0 && (
        <div className={styles.pending}>
          <div className={styles.pendingTitle}>
            ⚡ {data.pendingDecisions.length} decision{data.pendingDecisions.length !== 1 ? "s" : ""} need your approval
          </div>
          {data.pendingDecisions.slice(0, 3).map((d, i) => (
            <div key={i} className={styles.pendingItem}>
              {d.desc}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
