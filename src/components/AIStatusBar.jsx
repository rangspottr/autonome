import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import styles from "./AIStatusBar.module.css";

export default function AIStatusBar({ lastRunAt }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.get("/agent/status").then(setStatus).catch(() => setStatus(null));
  }, []);

  const activeCount = status?.activeAgents ?? 5;

  function relativeTime(ts) {
    if (!ts) return null;
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  const scanTime = lastRunAt ? relativeTime(lastRunAt) : (status?.lastRunAt ? relativeTime(status.lastRunAt) : null);

  return (
    <div
      className={styles.bar}
      aria-label={`${activeCount} AI agent${activeCount !== 1 ? "s" : ""} are actively monitoring your business${scanTime ? `, last scan ${scanTime}` : ""}`}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.text}>
        {activeCount} agent{activeCount !== 1 ? "s" : ""} active
        <span className={styles.sep}>·</span>
        monitoring your business
        {scanTime && (
          <>
            <span className={styles.sep}>·</span>
            last scan {scanTime}
          </>
        )}
      </span>
    </div>
  );
}
