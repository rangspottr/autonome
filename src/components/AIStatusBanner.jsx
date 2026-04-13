import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "./AgentMeta.js";
import styles from "./AIStatusBanner.module.css";

const AGENT_KEYS = Object.keys(AgentMeta);

export default function AIStatusBanner({ onNavigateToConnections }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/ai/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  if (status.active) {
    return (
      <div className={styles.activeBanner}>
        <div className={styles.activeLeft}>
          <span className={styles.activeDot} />
          <div className={styles.activeInfo}>
            <span className={styles.activeText}>
              AI Active
              {status.model && <span className={styles.activeModel}> · {status.model}</span>}
            </span>
            <span className={styles.activeSub}>Powering all {AGENT_KEYS.length} specialist agents</span>
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
        <div className={styles.offlineHeadline}>Your AI team is operating on business data</div>
        <div className={styles.offlineText}>
          Connect an AI provider to unlock advanced analysis, synthesis, and proactive recommendations. Your agents are already monitoring your business.
        </div>
      </div>
      <button
        className={styles.activateBtn}
        onClick={onNavigateToConnections}
        type="button"
      >
        Upgrade Intelligence →
      </button>
    </div>
  );
}
