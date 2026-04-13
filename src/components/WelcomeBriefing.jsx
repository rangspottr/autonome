import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "./AgentMeta.js";
import styles from "./WelcomeBriefing.module.css";

function $$(n) {
  if (!n) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

export default function WelcomeBriefing({ onDismiss, onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/metrics/summary")
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  const contacts = summary?.contacts?.total || 0;
  const deals = summary?.deals?.open || 0;
  const pipelineValue = summary?.deals?.pipelineValue || 0;
  const overdueInvoices = summary?.invoices?.overdue || 0;
  const overdueAmount = summary?.invoices?.outstanding || 0;

  const hasData = contacts > 0 || deals > 0 || (summary?.invoices?.total || 0) > 0;

  const topRisks = [];
  if (overdueInvoices > 0) {
    topRisks.push({
      icon: "!",
      text: `${overdueInvoices} overdue invoice${overdueInvoices !== 1 ? "s" : ""} totaling ${$$(overdueAmount)}`,
      nav: "finance",
    });
  }
  if (deals > 0) {
    topRisks.push({
      icon: "!",
      text: `${deals} open deal${deals !== 1 ? "s" : ""} in pipeline — review for stale activity`,
      nav: "sales",
    });
  }

  const topOpps = [];
  if (pipelineValue > 0) {
    topOpps.push({
      icon: "▲",
      text: `${$$(pipelineValue)} pipeline value ready to close`,
      nav: "sales",
    });
  }
  if (contacts > 0) {
    topOpps.push({
      icon: "▲",
      text: `${contacts} contact${contacts !== 1 ? "s" : ""} in your CRM — nurture them`,
      nav: "sales",
    });
  }

  const nextActions = [
    { icon: "→", text: "Ask your agents a question in the Boardroom", nav: "boardroom" },
    { icon: "→", text: "Set autonomy rules for your agents", nav: "autonomy-rules" },
    ...(overdueInvoices > 0 ? [{ icon: "→", text: `Review ${overdueInvoices} overdue invoice${overdueInvoices !== 1 ? "s" : ""}`, nav: "finance" }] : []),
    ...(deals > 0 ? [{ icon: "→", text: "Follow up on deals in your pipeline", nav: "sales" }] : []),
  ].slice(0, 5);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>●</span>
          <div>
            <div className={styles.headerTitle}>Your AI Team Has Completed Their Initial Scan</div>
            <div className={styles.headerSub}>Five specialist agents are now monitoring your business</div>
          </div>
        </div>
        <button className={styles.dismissBtn} onClick={onDismiss} type="button">
          Dismiss ✕
        </button>
      </div>

      <div className={styles.grid}>
        {/* Initial Business Scan */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Initial Business Scan</div>
          {loading ? (
            <div className={styles.loading}>Scanning…</div>
          ) : (
            <div className={styles.scanList}>
              <div className={styles.scanItem}>
                <span className={styles.scanLabel}>Contacts imported</span>
                <span className={styles.scanValue}>{contacts}</span>
              </div>
              <div className={styles.scanItem}>
                <span className={styles.scanLabel}>Deals in pipeline</span>
                <span className={styles.scanValue}>{deals}</span>
              </div>
              <div className={styles.scanItem}>
                <span className={styles.scanLabel}>Pipeline value</span>
                <span className={styles.scanValue}>{$$(pipelineValue)}</span>
              </div>
              <div className={styles.scanItem}>
                <span className={styles.scanLabel}>Overdue invoices</span>
                <span className={styles.scanValue} style={{ color: overdueAmount > 0 ? "var(--color-danger)" : undefined }}>
                  {overdueInvoices > 0 ? `${overdueInvoices} (${$$(overdueAmount)})` : "None"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Risks */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Top Risks</div>
          {topRisks.length === 0 ? (
            <div className={styles.emptyMsg}>
              {hasData
                ? "No risks detected yet — agents are monitoring."
                : "Add business data and your agents will flag risks immediately."}
            </div>
          ) : (
            <div className={styles.riskList}>
              {topRisks.map((r, i) => (
                <button key={i} className={styles.riskItem} onClick={() => onNavigate?.(r.nav)} type="button">
                  <span className={styles.riskIcon}>{r.icon}</span>
                  <span className={styles.riskText}>{r.text}</span>
                  <span className={styles.riskArrow}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Top Opportunities */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Top Opportunities</div>
          {topOpps.length === 0 ? (
            <div className={styles.emptyMsg}>
              {hasData
                ? "Agents are analyzing your data for opportunities."
                : "Import contacts and deals to unlock opportunity detection."}
            </div>
          ) : (
            <div className={styles.riskList}>
              {topOpps.map((o, i) => (
                <button key={i} className={styles.riskItem} onClick={() => onNavigate?.(o.nav)} type="button">
                  <span className={styles.riskIcon}>{o.icon}</span>
                  <span className={styles.riskText}>{o.text}</span>
                  <span className={styles.riskArrow}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Next Actions */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Recommended Next Actions</div>
          <div className={styles.actionsList}>
            {nextActions.map((a, i) => (
              <button key={i} className={styles.actionItem} onClick={() => onNavigate?.(a.nav)} type="button">
                <span className={styles.actionIcon}>{a.icon}</span>
                <span className={styles.actionText}>{a.text}</span>
                <span className={styles.actionArrow}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Team Status */}
      <div className={styles.agentSection}>
        <div className={styles.agentSectionTitle}>Your AI Team is Active and Monitoring</div>
        <div className={styles.agentGrid}>
          {Object.entries(AgentMeta).map(([key, meta]) => (
            <div key={key} className={styles.agentCard} style={{ borderTopColor: meta.color }}>
              <div className={styles.agentAvatarRow}>
                <div className={styles.agentAvatar} style={{ background: meta.bg, color: meta.color }}>
                  {meta.icon}
                </div>
                <div className={styles.agentStatus}>
                  <span className={styles.agentPulse} style={{ background: meta.color }} />
                  <span className={styles.agentStatusText}>Active</span>
                </div>
              </div>
              <div className={styles.agentName}>{meta.label}</div>
              <div className={styles.agentFocus}>{meta.focus}</div>
              <div className={styles.agentDesc}>{meta.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
