import { useState, useEffect, useCallback } from "react";
import { T } from "./lib/theme.js";
import { dbLoad, dbSave } from "./lib/storage.js";
import { calcHealth } from "./lib/engine/health.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import { executiveDecisions } from "./lib/engine/decisions.js";
import Setup from "./views/Setup.jsx";
import CmdCenter from "./views/CmdCenter.jsx";
import AgentView from "./views/AgentView.jsx";
import ApprovalView from "./views/ApprovalView.jsx";
import FinanceView from "./views/FinanceView.jsx";
import SalesView from "./views/SalesView.jsx";
import OpsView from "./views/OpsView.jsx";
import InventoryView from "./views/InventoryView.jsx";
import ROIView from "./views/ROIView.jsx";
import AuditView from "./views/AuditView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import ProcessView from "./views/ProcessView.jsx";
import KnowledgeView from "./views/KnowledgeView.jsx";

const NAV_ITEMS = [
  { id: "cmd", icon: "⚡", label: "Command Center" },
  { id: "agents", icon: "🤖", label: "Agents" },
  { id: "approvals", icon: "🔔", label: "Approvals" },
  { id: "finance", icon: "💰", label: "Finance" },
  { id: "sales", icon: "📈", label: "Sales" },
  { id: "ops", icon: "⚙️", label: "Operations" },
  { id: "inventory", icon: "📦", label: "Inventory" },
  { id: "roi", icon: "📊", label: "ROI" },
  { id: "process", icon: "🔍", label: "Process" },
  { id: "knowledge", icon: "📚", label: "Knowledge" },
  { id: "audit", icon: "📋", label: "Audit Log" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

const GLOBAL_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background: ${T.bg}; color: ${T.tx}; }
  input, select, textarea, button { font-family: 'Plus Jakarta Sans', sans-serif; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.bd2}; border-radius: 3px; }
`;

export default function App() {
  const [db, setDb] = useState(null);
  const [view, setView] = useState("cmd");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    dbLoad().then((data) => {
      setDb(data);
      setLoading(false);
    });
  }, []);

  const handleUpdate = useCallback(
    async (newDb) => {
      setDb(newDb);
      await dbSave(newDb);
    },
    []
  );

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          background: T.bg,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 14, color: T.dm }}>Loading Autonome…</div>
        </div>
      </div>
    );
  }

  // Show setup if not configured
  if (!db.cfg.ok) {
    return (
      <>
        <style>{GLOBAL_STYLES}</style>
        <ErrorBoundary>
          <Setup db={db} onSave={handleUpdate} />
        </ErrorBoundary>
      </>
    );
  }

  const health = calcHealth(db);
  const pendingApprovals = db ? (executiveDecisions(db) || []).filter((d) => d.needsApproval && !d.auto).length : 0;

  const VIEWS = {
    cmd: <CmdCenter db={db} onUpdate={handleUpdate} />,
    agents: <AgentView db={db} onUpdate={handleUpdate} />,
    approvals: <ApprovalView db={db} onUpdate={handleUpdate} />,
    finance: <FinanceView db={db} onUpdate={handleUpdate} />,
    sales: <SalesView db={db} onUpdate={handleUpdate} />,
    ops: <OpsView db={db} onUpdate={handleUpdate} />,
    inventory: <InventoryView db={db} onUpdate={handleUpdate} />,
    roi: <ROIView db={db} />,
    process: <ProcessView db={db} onUpdate={handleUpdate} />,
    knowledge: <KnowledgeView db={db} onUpdate={handleUpdate} />,
    audit: <AuditView db={db} />,
    settings: <SettingsView db={db} onUpdate={handleUpdate} />,
  };

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <div
          style={{
            width: sidebarOpen ? 220 : 60,
            background: T.tx,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            transition: "width 0.25s",
            overflow: "hidden",
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding: sidebarOpen ? "20px 16px 16px" : "20px 0 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: sidebarOpen ? "flex-start" : "center",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span style={{ fontSize: 22 }}>⚡</span>
            {sidebarOpen && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>Autonome</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{db.cfg.name || "v12"}</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
            {NAV_ITEMS.map((item) => {
              const isActive = view === item.id;
              const badge = item.id === "approvals" && pendingApprovals > 0 ? pendingApprovals : null;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  title={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: sidebarOpen ? "8px 10px" : "10px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.6)",
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    marginBottom: 2,
                    textAlign: "left",
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                    position: "relative",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  {sidebarOpen && <span style={{ flex: 1 }}>{item.label}</span>}
                  {badge !== null && sidebarOpen && (
                    <span
                      style={{
                        background: T.rd,
                        color: "#fff",
                        borderRadius: 10,
                        padding: "1px 6px",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {badge}
                    </span>
                  )}
                  {badge !== null && !sidebarOpen && (
                    <span
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: T.rd,
                        color: "#fff",
                        borderRadius: 8,
                        width: 14,
                        height: 14,
                        fontSize: 9,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Health score */}
          {sidebarOpen && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>HEALTH SCORE</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    background: "rgba(255,255,255,0.15)",
                    borderRadius: 2,
                  }}
                >
                  <div
                    style={{
                      width: `${health}%`,
                      height: "100%",
                      background: health >= 70 ? T.gn : health >= 40 ? T.am : T.rd,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: health >= 70 ? T.gn : health >= 40 ? T.am : T.rd,
                  }}
                >
                  {health}
                </span>
              </div>
            </div>
          )}

          {/* Toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            style={{
              padding: "12px",
              background: "rgba(255,255,255,0.05)",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: 16,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Top bar */}
          <div
            style={{
              padding: "16px 24px",
              borderBottom: `1px solid ${T.bd}`,
              background: T.wh,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.tx }}>
              {NAV_ITEMS.find((n) => n.id === view)?.label || "Autonome"}
            </h1>
            <div style={{ fontSize: 12, color: T.mt }}>
              {db.cfg.name} · {db.cfg.type}
            </div>
          </div>

          {/* View content */}
          <div style={{ padding: "24px" }}>
            <ErrorBoundary key={view}>
              {VIEWS[view] || <div style={{ color: T.mt }}>View not found.</div>}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </>
  );
}
