import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "./AgentMeta.js";
import styles from "./AIStatusBanner.module.css";

const AGENT_KEYS = Object.keys(AgentMeta);

export default function AIStatusBanner() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(() => {
    setError(false);
    api
      .get("/ai/status")
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-retry on error after 30 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(fetchStatus, 30000);
    return () => clearTimeout(timer);
  }, [error, fetchStatus]);

  if (loading) {
    return (
      <div className={styles.offlineBanner} style={{ opacity: 0.7 }}>
        <div className={styles.offlineIconWrap}>
          <span className={styles.offlineIcon}>◉</span>
        </div>
        <div className={styles.offlineBody}>
          <div className={styles.offlineHeadline}>Checking AI status…</div>
          <div className={styles.offlineText}>
            Your agents are monitoring your business while status is confirmed.
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.offlineBanner}>
        <div className={styles.offlineIconWrap}>
          <span className={styles.offlineIcon}>◉</span>
        </div>
        <div className={styles.offlineBody}>
          <div className={styles.offlineHeadline}>AI status unavailable — your agents are still operating on business data</div>
          <div className={styles.offlineText}>
            Status check failed. Your agents continue monitoring your business in the background.
          </div>
        </div>
        <button
          className={styles.activateBtn}
          onClick={fetchStatus}
          type="button"
        >
          Retry →
        </button>
      </div>
    );
  }

  if (status && status.status === 'needs_attention') {
    return (
      <div className={styles.offlineBanner} style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)" }}>
        <div className={styles.offlineIconWrap}>
          <span className={styles.offlineIcon} style={{ color: "var(--color-warning)" }}>⚠</span>
        </div>
        <div className={styles.offlineBody}>
          <div className={styles.offlineHeadline} style={{ color: "var(--color-warning)" }}>AI Needs Attention</div>
          <div className={styles.offlineText}>
            Your AI provider is configured but the last connection test failed. Check your API key, model access, and billing in Settings.
          </div>
        </div>
      </div>
    );
  }

  if (status && status.active) {
    return (
      <div className={styles.activeBanner}>
        <div className={styles.activeLeft}>
          <span className={styles.activeDot} />
          <div className={styles.activeInfo}>
            <span className={styles.activeText}>
              AI Team Active
            </span>
            <span className={styles.activeSub}>Your AI specialists are analyzing your business</span>
          </div>
        </div>
        <div className={styles.activeAgents}>
          {AGENT_KEYS.map((key) => {
            const meta = AgentMeta[key];
            return (
              <span
                key={key}
                className={styles.activeAgentPill}
                style={{ background: meta.bg, color: meta.color }}
                title={meta.description}
              >
                {meta.icon}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.offlineBanner}>
      <div className={styles.offlineIconWrap}>
        <span className={styles.offlineIcon}>◉</span>
      </div>
      <div className={styles.offlineBody}>
        <div className={styles.offlineHeadline}>Operating in Data-Driven Mode</div>
        <div className={styles.offlineText}>
          Your agents are monitoring your business data. Connect an AI provider in Settings to unlock full specialist intelligence.
        </div>
      </div>
    </div>
  );
}
