import { T } from "../lib/theme.js";
import { sd } from "../lib/utils.js";
import Card from "../components/Card.jsx";
import Pill from "../components/Pill.jsx";

export default function AuditView({ db }) {
  const audit = [...(db.audit || [])].reverse();

  const AGENT_COLORS = {
    Finance: "green",
    Revenue: "blue",
    Operations: "amber",
    Growth: "purple",
    Support: "muted",
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Audit Log</h2>
        <div style={{ fontSize: 13, color: T.dm }}>{audit.length} entries — all agent actions are logged here.</div>
      </div>

      {audit.length === 0 ? (
        <Card>
          <p style={{ color: T.mt, fontSize: 13, textAlign: "center", padding: 32 }}>
            No audit entries yet. Actions will appear here as agents execute.
          </p>
        </Card>
      ) : (
        <Card>
          {audit.map((entry) => (
            <div key={entry.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.tx }}>{entry.desc}</div>
                  <div style={{ fontSize: 11, color: T.mt, marginTop: 2 }}>
                    {new Date(entry.at).toLocaleString()}
                    {entry.approvedBy && ` · Approved by: ${entry.approvedBy}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <Pill
                    label={entry.agent}
                    variant={AGENT_COLORS[entry.agent] || "muted"}
                  />
                  {entry.auto && <Pill label="Auto" variant="muted" />}
                  {entry.delivered && <Pill label="Delivered" variant="green" />}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
