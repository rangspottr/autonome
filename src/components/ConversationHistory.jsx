import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "./AgentMeta.js";
import styles from "./ConversationHistory.module.css";

function dayGroup(ts) {
  if (!ts) return "Earlier";
  const now = new Date();
  const d = new Date(ts);
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const MODE_LABELS = {
  quick: "Quick",
  agent: "Agent",
  boardroom: "Boardroom",
};

export default function ConversationHistory({ onOpen }) {
  const [sessions, setSessions] = useState([]);
  const [unresolved, setUnresolved] = useState({ sessions: [], pending_decisions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [convData, unresolvedData] = await Promise.all([
        api.get("/command/conversations"),
        api.get("/command/unresolved"),
      ]);
      setSessions(convData.sessions || []);
      setUnresolved({
        sessions: unresolvedData.unresolved_sessions || [],
        pending_decisions: unresolvedData.pending_decisions || [],
      });
    } catch (err) {
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group sessions by day
  const grouped = sessions.reduce((acc, s) => {
    const group = dayGroup(s.updated_at);
    if (!acc[group]) acc[group] = [];
    acc[group].push(s);
    return acc;
  }, {});

  const groupOrder = ["Today", "Yesterday", "Earlier"];

  return (
    <div className={styles.root}>
      {/* Unresolved section */}
      {(unresolved.sessions.length > 0 || unresolved.pending_decisions.length > 0) && (
        <div className={styles.unresolvedSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Needs Attention</span>
            <span className={styles.unresolvedBadge}>
              {unresolved.sessions.length + unresolved.pending_decisions.length}
            </span>
          </div>

          {unresolved.sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onOpen={onOpen}
              urgent
            />
          ))}

          {unresolved.pending_decisions.map((d) => (
            <div key={d.id} className={[styles.sessionRow, styles.sessionRowUrgent].join(" ")}>
              <div className={styles.sessionIcon}>
                <span className={styles.modeTag}>ACT</span>
              </div>
              <div className={styles.sessionContent}>
                <div className={styles.sessionTitle}>{d.description}</div>
                <div className={styles.sessionMeta}>
                  <span>{d.agent}</span>
                  <span className={styles.dot} />
                  <span>{d.outcome}</span>
                </div>
              </div>
              <div className={styles.pendingDot} />
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loading}>Loading conversations...</div>
      )}

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      {/* Grouped sessions */}
      {!loading && sessions.length === 0 && (
        <div className={styles.empty}>
          No conversations yet. Start a quick question or agent chat.
        </div>
      )}

      {groupOrder.map((group) => {
        const items = grouped[group];
        if (!items || items.length === 0) return null;
        return (
          <div key={group} className={styles.group}>
            <div className={styles.groupLabel}>{group}</div>
            {items.map((s) => (
              <SessionRow key={s.id} session={s} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SessionRow({ session, onOpen, urgent }) {
  const agentMeta = session.agent && AgentMeta[session.agent] ? AgentMeta[session.agent] : null;
  const modeLabel = MODE_LABELS[session.mode] || session.mode;

  return (
    <button
      className={[styles.sessionRow, urgent ? styles.sessionRowUrgent : ""].join(" ")}
      onClick={() => onOpen && onOpen(session)}
    >
      <div className={styles.sessionIcon}>
        {agentMeta ? (
          <span
            className={styles.agentIcon}
            style={{ background: agentMeta.bg, color: agentMeta.color }}
          >
            {agentMeta.icon}
          </span>
        ) : (
          <span className={styles.modeTag}>{modeLabel.slice(0, 3).toUpperCase()}</span>
        )}
      </div>
      <div className={styles.sessionContent}>
        <div className={styles.sessionTitle}>
          {session.title || previewText(session) || "Untitled"}
        </div>
        <div className={styles.sessionMeta}>
          {agentMeta && <span style={{ color: agentMeta.color }}>{agentMeta.label}</span>}
          {agentMeta && <span className={styles.dot} />}
          <span>{modeLabel}</span>
          <span className={styles.dot} />
          <span>{session.message_count || 0} messages</span>
        </div>
      </div>
      <div className={styles.sessionTime}>
        <span className={styles.timeText}>
          {dayGroup(session.updated_at) === "Today"
            ? formatTime(session.updated_at)
            : formatDate(session.updated_at)}
        </span>
        {session.has_pending_actions && <div className={styles.pendingDot} />}
      </div>
    </button>
  );
}

function previewText(session) {
  if (!session.last_message) return "";
  const msg = session.last_message;
  if (msg.length <= 60) return msg;
  return msg.slice(0, 60) + "…";
}
