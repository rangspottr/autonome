import { useEffect, useState } from "react";
import { T } from "../lib/theme.js";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Bar from "../components/Bar.jsx";

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
      <div style={{ padding: 40, textAlign: "center", color: T.rd }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Failed to load ROI data</div>
        <div style={{ fontSize: 13, color: T.mt }}>{error}</div>
      </div>
    );
  }

  if (!roi || health === null) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: T.mt }}>
        <div style={{ fontSize: 14 }}>Loading metrics…</div>
      </div>
    );
  }

  const metrics = [
    { label: "Revenue Collected", value: $$(roi.collected), color: T.gn, sub: "via agent actions" },
    { label: "Hours Saved", value: `${roi.hoursSaved}h`, color: T.bl, sub: "vs manual work" },
    { label: "Labor Saved ($)", value: $$(roi.moneySaved), color: T.gn, sub: `at $35/hr rate` },
    { label: "Headcount Equiv", value: `${roi.headcountEquiv} FTE`, color: T.pu, sub: "per month" },
    { label: "Deals Closed", value: roi.dealsClosed, color: T.bl, sub: "by revenue agent" },
    { label: "Total Actions", value: roi.totalActions, color: T.am, sub: "automated" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>ROI Dashboard</h2>
        <div style={{ fontSize: 13, color: T.dm }}>Track the value Autonome is generating for your business.</div>
      </div>

      {/* Business Health */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>Business Health Score</div>
            <div style={{ fontSize: 11, color: T.mt }}>Based on revenue, deals, tasks, and inventory</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: health >= 70 ? T.gn : health >= 40 ? T.am : T.rd }}>
            {health}
          </div>
        </div>
        <Bar value={health} max={100} />
      </Card>

      {/* ROI Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.tx, marginTop: 2 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: T.mt }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Workflow Outcomes */}
      <Card>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: T.tx }}>Workflow Outcomes</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Active", value: roi.activeWf, color: T.bl },
            { label: "Completed", value: roi.completedWf, color: T.gn },
            { label: "Led to Payment", value: roi.paidWf, color: T.gn },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 11, color: T.mt }}>{m.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Sent Emails */}
      <Card style={{ marginTop: 12 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: T.tx }}>Email Activity</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.gn }}>{roi.realSent}</div>
            <div style={{ fontSize: 11, color: T.mt }}>Delivered (Real)</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.am }}>{roi.loggedSent}</div>
            <div style={{ fontSize: 11, color: T.mt }}>Logged (Simulated)</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
