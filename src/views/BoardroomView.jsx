import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import Boardroom from "../components/Boardroom.jsx";
import Skeleton from "../components/Skeleton.jsx";
import styles from "./BoardroomView.module.css";

function BoardroomPreamble() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const [decisionsData, handoffsData, alertsData] = await Promise.allSettled([
          api.get("/agent/decisions"),
          api.get("/agents/handoffs"),
          api.get("/proactive-alerts/stats"),
        ]);

        if (cancelled) return;

        const decisions = decisionsData.status === "fulfilled" ? (decisionsData.value || []) : [];
        const handoffs = handoffsData.status === "fulfilled" ? (handoffsData.value || []) : [];
        const alertStats = alertsData.status === "fulfilled" ? (alertsData.value || {}) : {};

        const pendingDecisions = Array.isArray(decisions) ? decisions.filter((d) => d.status === "pending").length : 0;
        const recentHandoffs = Array.isArray(handoffs) ? handoffs.length : 0;
        const criticalAlerts = alertStats.bySeverity?.critical || 0;
        const highAlerts = alertStats.bySeverity?.high || 0;
        const activeAgents = alertStats.activeAgents || 5;

        setStatus({ pendingDecisions, recentHandoffs, criticalAlerts, highAlerts, activeAgents });
      } catch {
        // non-blocking — preamble fails silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  const suggestions = [];
  if (status?.criticalAlerts > 0 || status?.highAlerts > 0) {
    const count = (status.criticalAlerts || 0) + (status.highAlerts || 0);
    suggestions.push(`Ask about your ${count} critical alert${count !== 1 ? "s" : ""}`);
  }
  if (status?.pendingDecisions > 0) {
    suggestions.push(`Review ${status.pendingDecisions} pending decision${status.pendingDecisions !== 1 ? "s" : ""} with your team`);
  }

  return (
    <div className={styles.preamble}>
      {loading ? (
        <div className={styles.preambleSkeletons}>
          <Skeleton variant="text" height={16} width={320} />
        </div>
      ) : status ? (
        <>
          <div className={styles.statusBar}>
            <span className={styles.statusItem}>
              <span className={styles.statusDot} />
              {status.activeAgents} agent{status.activeAgents !== 1 ? "s" : ""} active
            </span>
            {status.pendingDecisions > 0 && (
              <span className={`${styles.statusItem} ${styles.statusWarning}`}>
                {status.pendingDecisions} pending decision{status.pendingDecisions !== 1 ? "s" : ""}
              </span>
            )}
            {status.recentHandoffs > 0 && (
              <span className={styles.statusItem}>
                {status.recentHandoffs} cross-agent handoff{status.recentHandoffs !== 1 ? "s" : ""}
              </span>
            )}
            {(status.criticalAlerts > 0 || status.highAlerts > 0) && (
              <span className={`${styles.statusItem} ${styles.statusDanger}`}>
                {status.criticalAlerts > 0 && `${status.criticalAlerts} critical`}
                {status.criticalAlerts > 0 && status.highAlerts > 0 && " · "}
                {status.highAlerts > 0 && `${status.highAlerts} high`}
                {" "}alert{(status.criticalAlerts + status.highAlerts) !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className={styles.suggestions}>
              {suggestions.map((s) => (
                <span key={s} className={styles.suggestion}>→ {s}</span>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function BoardroomView() {
  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Boardroom</h2>
        <p className={styles.pageDesc}>
          Bring your entire AI team together. Ask a question and hear from all five specialists at once.
        </p>
      </div>
      <BoardroomPreamble />
      <Boardroom />
    </div>
  );
}
