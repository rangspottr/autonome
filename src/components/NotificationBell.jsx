import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import styles from "./NotificationBell.module.css";

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

const TYPE_ICONS = {
  daily_digest: "DG",
  approval_needed: "!",
  critical_risk: "!!",
  boardroom_summary: "BR",
  agent_alert: "AG",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get("/notifications?limit=20");
      setNotifications(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, 30000);
    return () => clearInterval(pollRef.current);
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function markRead(id) {
    try {
      await api.post(`/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await api.post("/notifications/read-all", {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap} ref={panelRef}>
      <button
        className={styles.bell}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
      >
        <span className={styles.bellIcon} aria-hidden="true">●</span>
        {unread > 0 && (
          <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.header}>
            <span className={styles.headerTitle}>Notifications</span>
            {unread > 0 && (
              <button
                className={styles.markAllBtn}
                onClick={markAllRead}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.list}>
            {notifications.length === 0 && (
              <div className={styles.empty}>No notifications yet.</div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={[styles.item, !n.read ? styles.unread : ""].join(" ")}
                onClick={() => !n.read && markRead(n.id)}
                role={!n.read ? "button" : undefined}
                tabIndex={!n.read ? 0 : undefined}
                onKeyDown={(e) => e.key === "Enter" && !n.read && markRead(n.id)}
              >
                <span className={styles.typeIcon} aria-hidden="true">
                  {TYPE_ICONS[n.type] || "●"}
                </span>
                <div className={styles.content}>
                  <div className={styles.notifTitle}>{n.title}</div>
                  {n.body && (
                    <div className={styles.notifBody}>{n.body}</div>
                  )}
                  <div className={styles.notifTime}>{relativeTime(n.created_at)}</div>
                </div>
                {!n.read && <span className={styles.unreadDot} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
