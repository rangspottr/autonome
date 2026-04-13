import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import styles from "./GrowthView.module.css";

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

export default function GrowthView() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchContacts = useCallback(async () => {
    try {
      const data = await api.get("/contacts?type=lead&limit=100");
      setContacts(data.contacts || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Growth</h2>
          <p className={styles.pageDesc}>
            Leads, prospects, and reactivation opportunities tracked by your Growth agent.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchContacts}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className={styles.loading}>
          {[1, 2, 3].map((i) => <div key={i} className={styles.loadingRow} />)}
        </div>
      ) : error ? (
        <div className={styles.error}>Could not load leads: {error}</div>
      ) : contacts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🌱</div>
          <div className={styles.emptyTitle}>No leads yet</div>
          <div className={styles.emptyDesc}>
            Leads and prospects will appear here once your Growth agent starts tracking them.
            Import contacts or connect a lead intake form in Connections.
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {contacts.map((c) => (
            <div key={c.id} className={styles.contactRow}>
              <div className={styles.contactAvatar}>
                {(c.name || "?")[0].toUpperCase()}
              </div>
              <div className={styles.contactInfo}>
                <div className={styles.contactName}>{c.name}</div>
                {c.email && <div className={styles.contactMeta}>{c.email}</div>}
                {c.phone && <div className={styles.contactMeta}>{c.phone}</div>}
              </div>
              <div className={styles.contactRight}>
                <Pill
                  label={c.status || "lead"}
                  variant={c.status === "qualified" ? "green" : c.status === "dormant" ? "muted" : "blue"}
                  size="sm"
                />
                {c.created_at && (
                  <div className={styles.contactTime}>{relativeTime(c.created_at)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
