import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { T } from "./lib/theme.js";
import { api } from "./lib/api.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";

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

import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import CreateWorkspacePage from "./pages/CreateWorkspacePage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";

const NAV_ITEMS = [
  { id: "cmd", icon: "CMD", label: "Command Center" },
  { id: "agents", icon: "AGT", label: "Agents" },
  { id: "approvals", icon: "APR", label: "Approvals" },
  { id: "finance", icon: "FIN", label: "Finance" },
  { id: "sales", icon: "REV", label: "Sales" },
  { id: "ops", icon: "OPS", label: "Operations" },
  { id: "inventory", icon: "INV", label: "Inventory" },
  { id: "roi", icon: "ROI", label: "ROI" },
  { id: "process", icon: "PRC", label: "Process" },
  { id: "knowledge", icon: "KNW", label: "Knowledge" },
  { id: "audit", icon: "LOG", label: "Audit Log" },
  { id: "settings", icon: "SET", label: "Settings" },
];

const GLOBAL_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background: ${T.bg}; color: ${T.tx}; }
  input, select, textarea, button { font-family: 'Plus Jakarta Sans', sans-serif; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.bd2}; border-radius: 3px; }
`;

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireWorkspace({ children }) {
  const { isAuthenticated, workspace, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!workspace) return <Navigate to="/create-workspace" replace />;
  return children;
}

function RequireSubscription({ children }) {
  const { isAuthenticated, workspace, subscription, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!workspace) return <Navigate to="/create-workspace" replace />;
  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trialing')) {
    return <Navigate to="/checkout" replace />;
  }
  return children;
}

function MainApp() {
  const { user, workspace, logout } = useAuth();
  const [view, setView] = useState("cmd");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [healthScore, setHealthScore] = useState(50);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  useEffect(() => {
    async function init() {
      try {
        const [healthData, agentStatus] = await Promise.all([
          api.get('/metrics/health').catch(() => ({ score: 50 })),
          api.get('/agent/status').catch(() => ({ pendingDecisions: 0 })),
        ]);
        setHealthScore(healthData.score || 50);
        setPendingApprovals(agentStatus.pendingDecisions || 0);

        const wsSettings = workspace?.settings || {};
        if (!wsSettings.setupCompleted) {
          setSetupNeeded(true);
        }
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [workspace]);

  const handleSetupComplete = useCallback(() => {
    setSetupNeeded(false);
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const [healthData, agentStatus] = await Promise.all([
        api.get('/metrics/health').catch(() => ({ score: 50 })),
        api.get('/agent/status').catch(() => ({ pendingDecisions: 0 })),
      ]);
      setHealthScore(healthData.score || 50);
      setPendingApprovals(agentStatus.pendingDecisions || 0);
    } catch {
      // ignore
    }
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", background: T.bg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, fontWeight: 800, letterSpacing: -1 }}>A</div>
          <div style={{ fontSize: 14, color: T.dm }}>Loading Autonome…</div>
        </div>
      </div>
    );
  }

  if (setupNeeded) {
    return (
      <>
        <style>{GLOBAL_STYLES}</style>
        <ErrorBoundary>
          <Setup onComplete={handleSetupComplete} />
        </ErrorBoundary>
      </>
    );
  }

  const VIEWS = {
    cmd: <CmdCenter onRefreshMetrics={refreshMetrics} />,
    agents: <AgentView onRefreshMetrics={refreshMetrics} />,
    approvals: <ApprovalView onRefreshMetrics={refreshMetrics} />,
    finance: <FinanceView />,
    sales: <SalesView />,
    ops: <OpsView />,
    inventory: <InventoryView />,
    roi: <ROIView />,
    process: <ProcessView />,
    knowledge: <KnowledgeView />,
    audit: <AuditView />,
    settings: <SettingsView />,
  };

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <div style={{ width: sidebarOpen ? 220 : 60, background: T.tx, flexShrink: 0, display: "flex", flexDirection: "column", transition: "width 0.25s", overflow: "hidden" }}>
          {/* Logo */}
          <div style={{ padding: sidebarOpen ? "20px 16px 16px" : "20px 0 16px", display: "flex", alignItems: "center", gap: 10, justifyContent: sidebarOpen ? "flex-start" : "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>A</span>
            {sidebarOpen && (
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>Autonome</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{workspace?.name || "v12"}</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
            {NAV_ITEMS.map((item) => {
              const isActive = view === item.id;
              const badge = item.id === "approvals" && pendingApprovals > 0 ? pendingApprovals : null;
              return (
                <button key={item.id} onClick={() => setView(item.id)} title={item.label} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: sidebarOpen ? "8px 10px" : "10px", borderRadius: 8, border: "none", background: isActive ? "rgba(255,255,255,0.15)" : "transparent", color: isActive ? "#fff" : "rgba(255,255,255,0.6)", fontWeight: isActive ? 700 : 500, fontSize: 13, cursor: "pointer", marginBottom: 2, textAlign: "left", justifyContent: sidebarOpen ? "flex-start" : "center", position: "relative", fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background 0.15s, color 0.15s" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, letterSpacing: 0.5, minWidth: 32, textAlign: "center" }}>{item.icon}</span>
                  {sidebarOpen && <span style={{ flex: 1 }}>{item.label}</span>}
                  {badge !== null && sidebarOpen && <span style={{ background: T.rd, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{badge}</span>}
                  {badge !== null && !sidebarOpen && <span style={{ position: "absolute", top: 4, right: 4, background: T.rd, color: "#fff", borderRadius: 8, width: 14, height: 14, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{badge}</span>}
                </button>
              );
            })}
          </nav>

          {/* Health score */}
          {sidebarOpen && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>HEALTH SCORE</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
                  <div style={{ width: `${healthScore}%`, height: "100%", background: healthScore >= 70 ? T.gn : healthScore >= 40 ? T.am : T.rd, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: healthScore >= 70 ? T.gn : healthScore >= 40 ? T.am : T.rd }}>{healthScore}</span>
              </div>
            </div>
          )}

          {/* Toggle */}
          <button onClick={() => setSidebarOpen((v) => !v)} style={{ padding: "12px", background: "rgba(255,255,255,0.05)", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Top bar */}
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.bd}`, background: T.wh, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.tx }}>{NAV_ITEMS.find((n) => n.id === view)?.label || "Autonome"}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 12, color: T.mt }}>{workspace?.name}{workspace?.industry ? ` · ${workspace.industry}` : ''}</div>
              {user && <button onClick={logout} style={{ fontSize: 12, color: T.mt, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Sign out</button>}
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

export default function App() {
  return (
    <AuthProvider>
      <style>{GLOBAL_STYLES}</style>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/create-workspace" element={<RequireAuth><CreateWorkspacePage /></RequireAuth>} />
        <Route path="/onboarding" element={<RequireWorkspace><OnboardingPage /></RequireWorkspace>} />
        <Route path="/checkout" element={<RequireWorkspace><CheckoutPage /></RequireWorkspace>} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/" element={<RequireSubscription><MainApp /></RequireSubscription>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
