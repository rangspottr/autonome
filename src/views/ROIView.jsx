import { useEffect, useState } from "react";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Bar from "../components/Bar.jsx";
import Stat from "../components/Stat.jsx";
import styles from "./ROIView.module.css";

export default function ROIView() {
  const [roi, setRoi] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.get("/metrics/roi"), api.get("/metrics/health")])
      .then(([roiData, healthData]) => {
        if (cancelled) return;
        setRoi(roiData);
        setHealth(healthData.score);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load metrics");
      });

    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className={styles.errorState}>
        <div className={styles.errorTitle}>Failed to load ROI data</div>
        <div className={styles.errorMsg}>{error}</div>
      </div>
    );
  }

  if (!roi || health === null) {
    return (
      <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", padding: "var(--space-10)", textAlign: "center" }}>
        Loading metrics…
      </p>
    );
  }

  const healthColor = health >= 70 ? "success" : health >= 40 ? "warning" : "danger";

  const metrics = [
    { label: "Revenue Collected", value: $$(roi.collected), sub: "via agent actions", color: "success" },
    { label: "Hours Saved", value: `${roi.hoursSaved}h`, sub: "vs manual work", color: "brand" },
    { label: "Labor Saved ($)", value: $$(roi.moneySaved), sub: "at $35/hr rate", color: "success" },
    { label: "Headcount Equiv", value: `${roi.headcountEquiv} FTE`, sub: "per month", color: "purple" },
    { label: "Deals Closed", value: roi.dealsClosed, sub: "by revenue agent", color: "brand" },
    { label: "Total Actions", value: roi.totalActions, sub: "automated", color: "warning" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>ROI Dashboard</h2>
          <div className={styles.pageSubtitle}>Track the value Autonome is generating for your business.</div>
        </div>
      </div>

      {/* Business Health */}
      <div className={styles.healthCard}>
        <div className={styles.healthHeader}>
          <div>
            <div className={styles.healthTitle}>Business Health Score</div>
            <div className={styles.healthSub}>Based on revenue, deals, tasks, and inventory</div>
          </div>
          <div
            className={styles.healthScore}
            style={{ color: `var(--color-${healthColor})` }}
          >
            {health}
          </div>
        </div>
        <Bar value={health} max={100} />
      </div>

      {/* ROI Metrics Grid */}
      <div className={styles.statsGrid}>
        {metrics.map((m) => (
          <Stat key={m.label} label={m.label} value={m.value} sub={m.sub} color={m.color} />
        ))}
      </div>

      {/* Workflow Outcomes */}
      <Card style={{ marginBottom: "var(--space-3)" }}>
        <h3 className={styles.sectionTitle}>Workflow Outcomes</h3>
        <div className={styles.workflowGrid}>
          {[
            { label: "Active", value: roi.activeWf, color: "var(--color-brand)" },
            { label: "Completed", value: roi.completedWf, color: "var(--color-success)" },
            { label: "Led to Payment", value: roi.paidWf, color: "var(--color-success)" },
          ].map((m) => (
            <div key={m.label} className={styles.workflowStat}>
              <div className={styles.workflowValue} style={{ color: m.color }}>{m.value}</div>
              <div className={styles.workflowLabel}>{m.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Email Activity */}
      <Card>
        <h3 className={styles.sectionTitle}>Email Activity</h3>
        <div className={styles.emailGrid}>
          <div className={styles.workflowStat}>
            <div className={styles.workflowValue} style={{ color: "var(--color-success)" }}>{roi.realSent}</div>
            <div className={styles.workflowLabel}>Delivered (Real)</div>
          </div>
          <div className={styles.workflowStat}>
            <div className={styles.workflowValue} style={{ color: "var(--color-warning)" }}>{roi.loggedSent}</div>
            <div className={styles.workflowLabel}>Logged (Simulated)</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
