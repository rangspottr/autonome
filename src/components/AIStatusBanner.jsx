import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import styles from "./AIStatusBanner.module.css";

export default function AIStatusBanner({ onNavigateToSettings }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/ai/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  if (status.active) {
    return (
      <div className={styles.activeBadge}>
        <span className={styles.activeDot} />
        <span className={styles.activeText}>AI Active</span>
        {status.model && <span className={styles.activeModel}>{status.model}</span>}
      </div>
    );
  }

  return (
    <div className={styles.offlineBanner}>
      <span className={styles.offlineIcon}>⚠️</span>
      <span className={styles.offlineText}>
        <strong>AI Brain Offline</strong> — Your agents are running in limited mode.
        Connect your AI provider to activate full intelligence.
      </span>
      <button
        className={styles.activateBtn}
        onClick={onNavigateToSettings}
        type="button"
      >
        Activate AI →
      </button>
    </div>
  );
}
