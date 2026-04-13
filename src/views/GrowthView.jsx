import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Stat from "../components/Stat.jsx";
import Skeleton from "../components/Skeleton.jsx";
import AGENT_META from "../components/AgentMeta.js";
import styles from "./GrowthView.module.css";

const AGENT_COLOR = "#7C3AED";
const AGENT_BG = "#F5F0FF";
const EMPTY_MSG = AGENT_META.growth.emptyStateMessage;

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
  const [workstream, setWorkstream] = useState(null);
  const [actions, setActions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [contactsRes, wsRes, actionsRes, decisionsRes] = await Promise.allSettled([
        api.get("/contacts?type=lead&limit=100"),
        api.get("/agents/growth/workstream"),
        api.get("/agents/growth/actions?limit=5"),
        api.get("/agent/decisions"),
      ]);

      if (contactsRes.status === "fulfilled") {
        const d = contactsRes.value;
        setContacts(d.contacts || d || []);
      }
      if (wsRes.status === "fulfilled") setWorkstream(wsRes.value);
      if (actionsRes.status === "fulfilled") setActions(actionsRes.value.actions || []);
      if (decisionsRes.status === "fulfilled") {
        const all = decisionsRes.value.pendingDecisions || [];
        setDecisions(all.filter((d) => d.agent === "growth"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const dormantCount = workstream?.summary?.dormantCustomers || 0;
  const staleLeads = workstream?.summary?.staleLeads || 0;
  const expansionOpps = workstream?.summary?.expansionOpportunities || 0;
  const newThisWeek = contacts.filter((c) => {
    if (!c.created_at) return false;
    return Date.now() - new Date(c.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  if (loading) {
    return (
      <div className={styles.view}>
        <div className={styles.pageHeader}>
          <Skeleton variant="text" height={28} width={160} />
          <Skeleton variant="rect" height={32} width={80} />
        </div>
        <div className={styles.statsGrid}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="card" height={80} />)}
        </div>
        <div className={styles.loading}>
          {[1, 2, 3].map((i) => <div key={i} className={styles.loadingRow} />)}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.agentBadge} style={{ background: AGENT_BG, color: AGENT_COLOR }}>
            GRO · Growth Specialist
          </div>
          <h2 className={styles.pageTitle}>Growth</h2>
          <p className={styles.pageDesc}>
            Dormant leads, expansion opportunities, and reactivation signals tracked by your Growth agent.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchAll}>
          Refresh
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.statsGrid}>
        <Stat label="Dormant Leads" value={dormantCount} color={dormantCount > 0 ? "amber" : undefined} sub="need reactivation" />
        <Stat label="New This Week" value={newThisWeek} color="green" sub="fresh leads" />
        <Stat label="Stale Leads" value={staleLeads} color={staleLeads > 0 ? "amber" : undefined} sub="no recent activity" />
        <Stat label="Expansion Opps" value={expansionOpps} color={expansionOpps > 0 ? "purple" : undefined} sub="upsell signals" />
      </div>

      {/* Growth Agent Activity */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle} style={{ color: AGENT_COLOR }}>Growth Agent Activity</span>
          {actions.length > 0 && <Pill label={`${actions.length} recent`} variant="purple" size="sm" />}
        </div>
        {actions.length === 0 ? (
          <div className={styles.activityEmpty}>
            {EMPTY_MSG}
          </div>
        ) : (
          <div className={styles.timeline}>
            {actions.map((a) => (
              <div key={a.id} className={styles.timelineItem} style={{ borderLeftColor: AGENT_COLOR }}>
                <div className={styles.timelineRow}>
                  <div className={styles.timelineTitle}>{a.description}</div>
                  <span className={styles.timelineTime}>{relativeTime(a.created_at)}</span>
                </div>
                {a.entity_name && (
                  <div className={styles.timelineMeta}>{a.entity_type} · {a.entity_name}</div>
                )}
                <Pill
                  label={a.outcome || "completed"}
                  variant={a.outcome === "completed" ? "green" : a.outcome === "blocked" ? "red" : "muted"}
                  size="sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Decisions */}
      {decisions.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Needs Your Attention</span>
            <Pill label={`${decisions.length} pending`} variant="amber" size="sm" />
          </div>
          <div className={styles.timeline}>
            {decisions.map((d) => (
              <div key={d.id} className={styles.timelineItem} style={{ borderLeftColor: "#D97706" }}>
                <div className={styles.timelineTitle}>{d.description || d.desc}</div>
                <Pill label="Pending Decision" variant="amber" size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lead List */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Lead Pipeline</span>
          {contacts.length > 0 && <Pill label={`${contacts.length} leads`} variant="purple" size="sm" />}
        </div>
        {contacts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>○</div>
            <div className={styles.emptyTitle}>No leads yet</div>
            <div className={styles.emptyDesc}>
              {EMPTY_MSG}
            </div>
          </div>
        ) : (
          <div className={styles.list}>
            {contacts.map((c) => (
              <div key={c.id} className={styles.contactRow}>
                <div className={styles.contactAvatar} style={{ background: AGENT_COLOR }}>
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
    </div>
  );
}
