import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import AgentMeta, { DEFAULT_AGENT_META } from "./AgentMeta.js";
import styles from "./ActivityFeed.module.css";

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

const OUTCOME_STYLES = {
  success: { color: "var(--color-success)", label: "✓" },
  completed: { color: "var(--color-success)", label: "✓" },
  blocked: { color: "var(--color-danger)", label: "✗" },
  pending: { color: "var(--color-warning)", label: "●" },
  handed_off: { color: "var(--color-info)", label: "→" },
};

function AgentAvatar({ agent }) {
  const meta = AgentMeta[agent] || DEFAULT_AGENT_META;
  return (
    <div
      className={styles.avatar}
      style={{ background: meta.bg, color: meta.color }}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.icon}
    </div>
  );
}

function EventItem({ event }) {
  const outcomeStyle = OUTCOME_STYLES[event.outcome] || {};
  const isHandoff = event.event_source === "agent_action" && event.handed_off_to;
  const isWorkflow = event.event_source === "workflow";

  const handoffMeta = isHandoff ? (AgentMeta[event.handed_off_to] || DEFAULT_AGENT_META) : null;

  return (
    <div className={styles.item}>
      <AgentAvatar agent={event.agent} />
      <div className={styles.itemBody}>
        <div className={styles.itemHeader}>
          <span className={styles.agentName}>
            {(AgentMeta[event.agent] || DEFAULT_AGENT_META).label}
          </span>
          {isWorkflow ? (
            <span className={styles.actionTag} style={{ background: "var(--color-purple-light)", color: "var(--color-purple)" }}>
              workflow
            </span>
          ) : (
            <span className={styles.actionTag}>
              {event.action}
            </span>
          )}
          {outcomeStyle.label && !isWorkflow && (
            <span className={styles.outcomeTag} style={{ color: outcomeStyle.color }}>
              {outcomeStyle.label}
            </span>
          )}
          {isWorkflow && (
            <span
              className={styles.outcomeTag}
              style={{ color: event.status === "completed" ? "var(--color-success)" : event.status === "paused" ? "var(--color-warning)" : "var(--color-text-muted)" }}
            >
              {event.status}
            </span>
          )}
        </div>
        <div className={styles.itemDesc}>
          {isWorkflow
            ? `${event.action} workflow ${event.status}${event.entity_type ? ` · ${event.entity_type}` : ""}`
            : event.description}
          {event.entity_name && (
            <span className={styles.entityLink}> · {event.entity_name}</span>
          )}
        </div>
        {isHandoff && handoffMeta && (
          <div className={styles.handoff}>
            <span className={styles.handoffArrow}>→</span>
            Handed off to{" "}
            <span style={{ color: handoffMeta.color, fontWeight: 500 }}>
              {handoffMeta.label}
            </span>
          </div>
        )}
        <div className={styles.itemTime}>{relativeTime(event.created_at)}</div>
      </div>
    </div>
  );
}

export default function ActivityFeed({ agent, pollInterval = 30000, limit = 30 }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sinceRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchEvents = useCallback(
    async (since = null) => {
      try {
        const endpoint = agent
          ? `/activity/timeline/${agent}?limit=${limit}${since ? `&since=${since}` : ""}`
          : `/activity/live?limit=${limit}${since ? `&since=${since}` : ""}`;

        const data = await api.get(endpoint);
        if (!mountedRef.current) return;

        const newEvents = agent ? data.actions || [] : data.events || [];

        if (since) {
          // Prepend new events
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const truly = newEvents.filter((e) => !existingIds.has(e.id));
            if (truly.length === 0) return prev;
            return [...truly, ...prev].slice(0, limit * 2);
          });
        } else {
          setEvents(newEvents);
        }

        if (newEvents.length > 0) {
          sinceRef.current = newEvents[0].created_at;
        }
      } catch (err) {
        if (mountedRef.current) setError(err.message);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [agent, limit]
  );

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError(null);
    fetchEvents(null);

    pollRef.current = setInterval(() => {
      fetchEvents(sinceRef.current);
    }, pollInterval);

    return () => {
      mountedRef.current = false;
      clearInterval(pollRef.current);
    };
  }, [fetchEvents, pollInterval]);

  if (loading && events.length === 0) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingPulse} />
        <div className={styles.loadingPulse} />
        <div className={styles.loadingPulse} />
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Could not load activity feed.</div>;
  }

  if (events.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>●</div>
        <div>No activity yet. Agents will appear here as they work.</div>
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      {events.map((event) => (
        <EventItem key={`${event.id}-${event.event_source}`} event={event} />
      ))}
    </div>
  );
}
