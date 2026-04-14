import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "./AgentMeta.js";
import Pill from "./Pill.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./BusinessBriefing.module.css";

const AGENTS = ["finance", "revenue", "operations", "growth", "support"];

function $$(n) {
  if (!n && n !== 0) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

function healthColor(score) {
  if (score >= 70) return "var(--color-success, #10B981)";
  if (score >= 40) return "var(--color-warning, #D97706)";
  return "var(--color-danger, #DC2626)";
}

function healthLabel(score) {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Needs Attention";
  return "At Risk";
}

function healthInterpretation(score) {
  if (score >= 70) return "Your business is operating well across monitored dimensions.";
  if (score >= 40) return "Several areas require attention — review the risks below.";
  return "Critical issues detected. Immediate action recommended.";
}

function severityVariant(severity) {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  return "muted";
}

export default function BusinessBriefing() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [alertStats, setAlertStats] = useState(null);
  const [workstreams, setWorkstreams] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [healthData, decisionsData, statsData] = await Promise.allSettled([
          api.get("/metrics/health"),
          api.get("/agent/decisions"),
          api.get("/proactive-alerts/stats"),
        ]);

        const wsResults = await Promise.allSettled(
          AGENTS.map((a) => api.get(`/agents/${a}/workstream`))
        );

        if (cancelled) return;

        if (healthData.status === "fulfilled") setHealth(healthData.value);
        if (decisionsData.status === "fulfilled") {
          const d = decisionsData.value;
          setDecisions(Array.isArray(d) ? d : []);
        }
        if (statsData.status === "fulfilled") setAlertStats(statsData.value);

        const wsMap = {};
        AGENTS.forEach((a, i) => {
          if (wsResults[i].status === "fulfilled") wsMap[a] = wsResults[i].value;
        });
        setWorkstreams(wsMap);
      } catch {
        // handled by individual settled checks
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <Skeleton variant="rect" height={80} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={120} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={120} style={{ marginBottom: 16 }} />
        <Skeleton variant="rect" height={120} />
      </div>
    );
  }

  const score = health?.score ?? null;
  const hasAnyData = score !== null || decisions.length > 0 || alertStats;

  if (!hasAnyData) {
    return (
      <div className={styles.firstScan}>
        <div className={styles.firstScanDot} />
        <div className={styles.firstScanTitle}>Your AI team is scanning your business for the first time.</div>
        <div className={styles.firstScanSub}>Initial briefing will appear shortly.</div>
      </div>
    );
  }

  // Build top risks from alert stats and workstream blockers
  const topRisks = [];
  AGENTS.forEach((a) => {
    const ws = workstreams[a];
    const meta = AgentMeta[a];
    if (!ws) return;
    (ws.blockers || []).slice(0, 2).forEach((b) => {
      if (topRisks.length < 3) {
        topRisks.push({ agent: a, meta, desc: b.description || b.desc || b, severity: b.severity || "high" });
      }
    });
  });
  // Fill from pending decisions if needed
  if (topRisks.length < 3) {
    decisions
      .filter((d) => d.status === "pending" && (d.severity === "critical" || d.severity === "high"))
      .slice(0, 3 - topRisks.length)
      .forEach((d) => {
        const meta = AgentMeta[d.agent] || AgentMeta.finance;
        topRisks.push({ agent: d.agent, meta, desc: d.description || d.desc, severity: d.severity || "high" });
      });
  }

  // Build top opportunities from workstreams
  const topOpps = [];
  AGENTS.forEach((a) => {
    const ws = workstreams[a];
    const meta = AgentMeta[a];
    if (!ws) return;
    const opps = ws.opportunities || ws.expansionOpportunities || [];
    opps.slice(0, 1).forEach((o) => {
      if (topOpps.length < 3) {
        topOpps.push({ agent: a, meta, desc: o.description || o.desc || o });
      }
    });
    if (topOpps.length < 3 && ws.pipelineValue > 0) {
      topOpps.push({ agent: a, meta, desc: `${$$(ws.pipelineValue)} pipeline value ready to close` });
    }
  });

  // Recommended actions — up to 5 pending decisions
  const recommendedActions = decisions
    .filter((d) => d.status === "pending")
    .slice(0, 5);

  // Agent ownership summary
  const agentSummaries = AGENTS.map((a) => {
    const ws = workstreams[a];
    const meta = AgentMeta[a];
    let statusLine = meta.monitoringStatement;
    if (ws) {
      if (a === "finance" && ws.overdueAmount > 0) {
        const count = ws.overdueCount || 2;
        statusLine = `${$$(ws.overdueAmount)} overdue across ${count} invoice${count !== 1 ? "s" : ""}`;
      } else if (a === "revenue" && ws.staleDealCount > 0) {
        statusLine = `${ws.staleDealCount} stale deal${ws.staleDealCount !== 1 ? "s" : ""}, ${$$(ws.pipelineValue || 0)} pipeline`;
      } else if (a === "operations" && ws.overdueTaskCount > 0) {
        statusLine = `${ws.overdueTaskCount} overdue task${ws.overdueTaskCount !== 1 ? "s" : ""} detected`;
      } else if (a === "growth" && ws.dormantLeadCount > 0) {
        statusLine = `${ws.dormantLeadCount} dormant lead${ws.dormantLeadCount !== 1 ? "s" : ""} identified`;
      } else if (a === "support" && ws.atRiskCount > 0) {
        statusLine = `${ws.atRiskCount} at-risk customer${ws.atRiskCount !== 1 ? "s" : ""} detected`;
      } else {
        statusLine = meta.monitoringStatement;
      }
    }
    return { agent: a, meta, statusLine };
  });

  return (
    <div className={styles.wrapper}>
      {/* Business Health */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Business Health</div>
        {score !== null ? (
          <div className={styles.healthRow}>
            <div
              className={styles.healthScore}
              style={{ color: healthColor(score), borderColor: healthColor(score) }}
            >
              {score}
            </div>
            <div className={styles.healthInfo}>
              <div className={styles.healthLabel} style={{ color: healthColor(score) }}>
                {healthLabel(score)}
              </div>
              <div className={styles.healthDesc}>{healthInterpretation(score)}</div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyLine}>Health data unavailable — agents are collecting metrics.</div>
        )}
      </div>

      {/* Top Risks */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Top Risks</div>
        {topRisks.length === 0 ? (
          <div className={styles.emptyLine}>No critical risks detected. Agents continue to monitor.</div>
        ) : (
          <div className={styles.itemList}>
            {topRisks.map((r, i) => (
              <div key={i} className={styles.riskItem}>
                <span
                  className={styles.agentIcon}
                  style={{ background: r.meta.bg, color: r.meta.color }}
                >
                  {r.meta.icon}
                </span>
                <span className={styles.itemDesc}>{r.desc}</span>
                <Pill label={r.severity} variant={severityVariant(r.severity)} size="sm" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Opportunities */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Top Opportunities</div>
        {topOpps.length === 0 ? (
          <div className={styles.emptyLine}>Agents are analyzing your data for opportunities.</div>
        ) : (
          <div className={styles.itemList}>
            {topOpps.map((o, i) => (
              <div key={i} className={styles.oppItem}>
                <span
                  className={styles.agentIcon}
                  style={{ background: o.meta.bg, color: o.meta.color }}
                >
                  {o.meta.icon}
                </span>
                <span className={styles.itemDesc}>{o.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Actions */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Recommended Actions</div>
        {recommendedActions.length === 0 ? (
          <div className={styles.emptyLine}>No pending decisions. Agents are monitoring.</div>
        ) : (
          <div className={styles.itemList}>
            {recommendedActions.map((d, i) => {
              const meta = AgentMeta[d.agent] || AgentMeta.finance;
              return (
                <div key={i} className={styles.actionItem}>
                  <span
                    className={styles.agentIcon}
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.icon}
                  </span>
                  <div className={styles.actionBody}>
                    <div className={styles.actionDesc}>{d.description || d.desc}</div>
                    <div className={styles.actionOwner}>{meta.label} agent</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Ownership Summary */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Agent Ownership Summary</div>
        <div className={styles.agentRow}>
          {agentSummaries.map(({ agent, meta, statusLine }) => (
            <div key={agent} className={styles.agentCard} style={{ borderTopColor: meta.color }}>
              <div className={styles.agentCardIcon} style={{ background: meta.bg, color: meta.color }}>
                {meta.icon}
              </div>
              <div className={styles.agentCardName}>{meta.label}</div>
              <div className={styles.agentCardStatus}>{statusLine}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
