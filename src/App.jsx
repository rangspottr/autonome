import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./lib/api.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Avatar from "./components/Avatar.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import SinceLastLogin from "./components/SinceLastLogin.jsx";
import styles from "./App.module.css";

import Setup from "./views/Setup.jsx";
import CmdCenter from "./views/CmdCenter.jsx";
import AgentView from "./views/AgentView.jsx";
import ApprovalView from "./views/ApprovalView.jsx";
import AlertsView from "./views/AlertsView.jsx";
import AutonomyView from "./views/AutonomyView.jsx";
import FinanceView from "./views/FinanceView.jsx";
import SalesView from "./views/SalesView.jsx";
import OpsView from "./views/OpsView.jsx";
import InventoryView from "./views/InventoryView.jsx";
import ROIView from "./views/ROIView.jsx";
import AuditView from "./views/AuditView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import ProcessView from "./views/ProcessView.jsx";
import KnowledgeView from "./views/KnowledgeView.jsx";

import CommandWidget from "./components/CommandWidget.jsx";

import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import CreateWorkspacePage from "./pages/CreateWorkspacePage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";

const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { id: "cmd", icon: "CMD", label: "Command Center" },
      { id: "agents", icon: "AGT", label: "Agents" },
      { id: "approvals", icon: "APR", label: "Approvals" },
      { id: "alerts", icon: "ALT", label: "Alerts" },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "finance", icon: "FIN", label: "Finance" },
      { id: "sales", icon: "REV", label: "Sales" },
      { id: "ops", icon: "OPS", label: "Operations" },
      { id: "inventory", icon: "INV", label: "Inventory" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "roi", icon: "ROI", label: "ROI" },
      { id: "process", icon: "PRC", label: "Process" },
      { id: "knowledge", icon: "KNW", label: "Knowledge" },
      { id: "audit", icon: "LOG", label: "Audit Log" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "autonomy", icon: "AUT", label: "Autonomy" },
      { id: "settings", icon: "SET", label: "Settings" },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

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
  if (!subscription || (subscription.status !== "active" && subscription.status !== "trialing")) {
    return <Navigate to="/checkout" replace />;
  }
  return children;
}

function MainApp() {
  const { user, workspace, logout } = useAuth();
  const [view, setView] = useState("cmd");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [healthScore, setHealthScore] = useState(50);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [devStatus, setDevStatus] = useState(null);
  const [showSinceLogin, setShowSinceLogin] = useState(true);
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    async function init() {
      try {
        const [healthData, agentStatus, statusData, alertsData, aiStatusData] = await Promise.all([
          api.get("/metrics/health").catch(() => ({ score: 50 })),
          api.get("/agent/status").catch(() => ({ pendingDecisions: 0 })),
          api.get("/settings/status").catch(() => null),
          api.get("/proactive-alerts?limit=1").catch(() => ({ total: 0 })),
          api.get("/settings/ai-status").catch(() => null),
        ]);
        setHealthScore(healthData.score || 50);
        setPendingApprovals(agentStatus.pendingDecisions || 0);
        setActiveAlerts(alertsData.total || 0);
        if (statusData) setDevStatus(statusData);
        if (aiStatusData) setAiStatus(aiStatusData);
        const wsSettings = workspace?.settings || {};
        if (!wsSettings.setupCompleted) setSetupNeeded(true);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [workspace]);

  const handleSetupComplete = useCallback(() => setSetupNeeded(false), []);

  const refreshMetrics = useCallback(async () => {
    try {
      const [healthData, agentStatus, alertsData] = await Promise.all([
        api.get("/metrics/health").catch(() => ({ score: 50 })),
        api.get("/agent/status").catch(() => ({ pendingDecisions: 0 })),
        api.get("/proactive-alerts?limit=1").catch(() => ({ total: 0 })),
      ]);
      setHealthScore(healthData.score || 50);
      setPendingApprovals(agentStatus.pendingDecisions || 0);
      setActiveAlerts(alertsData.total || 0);
    } catch {
      // ignore
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.loadScreen}>
        <div className={styles.loadInner}>
          <div className={styles.loadIcon}>A</div>
          <div className={styles.loadText}>Loading Autonome…</div>
        </div>
      </div>
    );
  }

  if (setupNeeded) {
    return (
      <ErrorBoundary>
        <Setup onComplete={handleSetupComplete} />
      </ErrorBoundary>
    );
  }

  const VIEWS = {
    cmd: (
      <>
        {showSinceLogin && (
          <SinceLastLogin onDismiss={() => setShowSinceLogin(false)} />
        )}
        <CmdCenter onRefreshMetrics={refreshMetrics} />
      </>
    ),
    agents: <AgentView onRefreshMetrics={refreshMetrics} />,
    approvals: <ApprovalView onRefreshMetrics={refreshMetrics} />,
    alerts: <AlertsView />,
    finance: <FinanceView />,
    sales: <SalesView />,
    ops: <OpsView />,
    inventory: <InventoryView />,
    roi: <ROIView />,
    process: <ProcessView />,
    knowledge: <KnowledgeView />,
    audit: <AuditView />,
    autonomy: <AutonomyView />,
    settings: <SettingsView />,
  };

  const healthColor =
    healthScore >= 70
      ? "var(--color-success)"
      : healthScore >= 40
      ? "var(--color-warning)"
      : "var(--color-danger)";
  const currentLabel = ALL_NAV.find((n) => n.id === view)?.label || "Autonome";

  return (
    <div className={styles.appLayout}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className={styles.mobileOverlay}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          styles.sidebar,
          !sidebarOpen ? styles.sidebarCollapsed : "",
          mobileOpen ? styles.sidebarMobileOpen : "",
        ].join(" ")}
        aria-label="Navigation"
      >
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <span className={styles.sidebarLogoIcon}>A</span>
          {sidebarOpen && (
            <div>
              <div className={styles.sidebarLogoText}>Autonome</div>
              <div className={styles.sidebarLogoSub}>{workspace?.name || "v12"}</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={styles.nav}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.navGroup}>
              {sidebarOpen && <div className={styles.navGroupLabel}>{group.label}</div>}
              {group.items.map((item) => {
                const isActive = view === item.id;
                const badge =
                  item.id === "approvals" && pendingApprovals > 0 ? pendingApprovals :
                  item.id === "alerts" && activeAlerts > 0 ? activeAlerts :
                  null;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setView(item.id);
                      setMobileOpen(false);
                    }}
                    title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      styles.navItem,
                      isActive ? styles.navItemActive : "",
                    ].join(" ")}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    {sidebarOpen && <span className={styles.navLabel}>{item.label}</span>}
                    {badge !== null && sidebarOpen && (
                      <span className={styles.badge}>{badge}</span>
                    )}
                    {badge !== null && !sidebarOpen && (
                      <span className={styles.badgeAbsolute}>{badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Health score */}
        {sidebarOpen && (
          <div className={styles.healthSection}>
            <div className={styles.healthLabel}>Health Score</div>
            <div className={styles.healthRow}>
              <div className={styles.healthTrack}>
                <div
                  className={styles.healthFill}
                  style={{ width: `${healthScore}%`, background: healthColor }}
                />
              </div>
              <span className={styles.healthVal} style={{ color: healthColor }}>
                {healthScore}
              </span>
            </div>
          </div>
        )}

        {/* Dev-mode indicator */}
        {sidebarOpen && devStatus && (devStatus.bypass_subscription || !devStatus.smtp) && (
          <div style={{ margin: "0 var(--space-3) var(--space-3)", padding: "6px 10px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "var(--radius-md)", fontSize: 11, color: "var(--color-warning)", lineHeight: 1.4 }}>
            <strong>Dev Mode</strong>
            {!devStatus.smtp && <div>SMTP not configured</div>}
            {devStatus.bypass_subscription && <div>Subscription bypassed</div>}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          className={styles.toggleBtn}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              className={styles.hamburger}
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <h1 className={styles.pageTitle}>{currentLabel}</h1>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.workspaceInfo}>
              {workspace?.name}
              {workspace?.industry ? ` · ${workspace.industry}` : ""}
            </span>
            {aiStatus !== null && (
              <span
                className={styles.aiStatusBadge}
                title={aiStatus.connected
                  ? `AI: ${aiStatus.model || "Connected"}`
                  : "AI: Limited Mode — Connect API key in Settings"}
                style={{
                  background: aiStatus.connected ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                  color: aiStatus.connected ? "var(--color-success)" : "var(--color-warning)",
                  border: `1px solid ${aiStatus.connected ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                }}
              >
                <span style={{ fontSize: 9, marginRight: 4 }}>●</span>
                {aiStatus.connected ? "AI On" : "AI Limited"}
              </span>
            )}
            <NotificationBell />
            {user && <Avatar name={user.full_name || user.email} size="sm" />}
            {user && (
              <button className={styles.signOutBtn} onClick={logout}>
                Sign out
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className={styles.content}>
          <ErrorBoundary key={view}>
            {VIEWS[view] || (
              <div style={{ color: "var(--color-text-muted)" }}>View not found.</div>
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Command widget — persists across all views */}
      <CommandWidget
        pendingApprovals={pendingApprovals}
        workspace={workspace}
        user={user}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/create-workspace"
            element={
              <RequireAuth>
                <CreateWorkspacePage />
              </RequireAuth>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RequireWorkspace>
                <OnboardingPage />
              </RequireWorkspace>
            }
          />
          <Route
            path="/checkout"
            element={
              <RequireWorkspace>
                <CheckoutPage />
              </RequireWorkspace>
            }
          />
          <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
          <Route
            path="/"
            element={
              <RequireSubscription>
                <MainApp />
              </RequireSubscription>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
