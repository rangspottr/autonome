import { useNavigate } from "react-router-dom";
import ConnectionsView from "../views/ConnectionsView.jsx";

export default function SetupConnectionsPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", padding: "16px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Onboarding setup</div>
          <h1 style={{ margin: 0, fontSize: 22, color: "var(--color-text-primary)" }}>Connect your business systems</h1>
        </div>
        <button
          onClick={() => navigate("/onboarding")}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "8px 12px",
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Back to onboarding
        </button>
      </div>
      <ConnectionsView />
    </div>
  );
}
