import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Stat from "../components/Stat.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import AGENT_META from "../components/AgentMeta.js";
import styles from "./SupportView.module.css";

const AGENT_COLOR = "#0891B2";
const AGENT_BG = "#ECFEFF";
const EMPTY_MSG = AGENT_META.support.emptyStateMessage;

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

export default function SupportView() {
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
        api.get("/contacts?type=customer&limit=100"),
        api.get("/agents/support/workstream"),
        api.get("/agents/support/actions?limit=5"),
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
        setDecisions(all.filter((d) => d.agent === "support"));
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

  const atRiskCount = workstream?.summary?.atRiskContacts || 0;
  const escalations = workstream?.summary?.recentEscalations || 0;
  const blockedActions = workstream?.summary?.blockedActionCount || 0;
  const totalCustomers = contacts.length;

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
            SUP · Support Specialist
          </div>
          <h2 className={styles.pageTitle}>Support</h2>
          <p className={styles.pageDesc}>
            Customer health, churn signals, and escalation patterns monitored by your Support agent.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchAll}>
          Refresh
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.statsGrid}>
        <Stat label="At-Risk Customers" value={atRiskCount} color={atRiskCount > 0 ? "red" : undefined} sub="churn signals detected" />
        <Stat label="Total Customers" value={totalCustomers} sub="in your base" />
        <Stat label="Recent Escalations" value={escalations} color={escalations > 0 ? "amber" : undefined} sub="need review" />
        <Stat label="Blocked Actions" value={blockedActions} color={blockedActions > 0 ? "amber" : undefined} sub="awaiting resolution" />
      </div>

      {/* Support Agent Activity */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle} style={{ color: AGENT_COLOR }}>Support Agent Activity</span>
          {actions.length > 0 && <Pill label={`${actions.length} recent`} variant="blue" size="sm" />}
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

      {/* Customer List */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Customer Base</span>
          {contacts.length > 0 && <Pill label={`${contacts.length} customers`} variant="blue" size="sm" />}
        </div>
        {contacts.length === 0 ? (
          <EmptyState
            icon={AGENT_META.support.icon}
            title="Support agent is standing by"
            description={AGENT_META.support.emptyStateMessage}
            agent="support"
            statusIndicator
          />
        ) : (
          <div className={styles.list}>
            {contacts.map((c) => (
              <div key={c.id} className={styles.contactRow}>
                <div className={styles.contactAvatar} style={{ background: c.status === "at_risk" ? "#DC2626" : AGENT_COLOR }}>
                  {(c.name || "?")[0].toUpperCase()}
                </div>
                <div className={styles.contactInfo}>
                  <div className={styles.contactName}>{c.name}</div>
                  {c.email && <div className={styles.contactMeta}>{c.email}</div>}
                  {c.phone && <div className={styles.contactMeta}>{c.phone}</div>}
                </div>
                <div className={styles.contactRight}>
                  <Pill
                    label={c.status || "active"}
                    variant={c.status === "at_risk" ? "red" : c.status === "churned" ? "muted" : "green"}
                    size="sm"
                  />
                  {c.last_contact_at && (
                    <div className={styles.contactTime}>{relativeTime(c.last_contact_at)}</div>
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
