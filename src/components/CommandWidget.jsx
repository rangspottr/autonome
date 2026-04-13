import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "./AgentMeta.js";
import AgentChat from "./AgentChat.jsx";
import Boardroom from "./Boardroom.jsx";
import ConversationHistory from "./ConversationHistory.jsx";
import styles from "./CommandWidget.module.css";

const TABS = [
  { id: "quick", label: "Quick Question" },
  { id: "agent", label: "Agent Direct" },
  { id: "boardroom", label: "Boardroom" },
  { id: "recent", label: "Recent" },
];

export default function CommandWidget({ pendingApprovals = 0, workspace }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("quick");
  const [quickMessage, setQuickMessage] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickResponse, setQuickResponse] = useState(null);
  const [quickError, setQuickError] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const inputRef = useRef(null);

  const totalBadge = pendingApprovals + unresolvedCount;

  const fetchUnresolved = useCallback(async () => {
    try {
      const data = await api.get("/command/unresolved");
      setUnresolvedCount(data.total || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchUnresolved();
    }
  }, [open, fetchUnresolved]);

  // Keyboard shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when quick tab opens
  useEffect(() => {
    if (open && activeTab === "quick" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, activeTab]);

  async function handleQuickSubmit(e) {
    e.preventDefault();
    if (!quickMessage.trim() || quickLoading) return;
    setQuickLoading(true);
    setQuickError(null);
    setQuickResponse(null);
    try {
      const data = await api.post("/ai/query", { message: quickMessage.trim() });
      setQuickResponse(data);
      setQuickMessage("");
    } catch (err) {
      setQuickError(err.message || "Failed to get response");
    } finally {
      setQuickLoading(false);
    }
  }

  function handleAgentSelect(agentKey) {
    setSelectedAgent(agentKey);
    setActiveTab("agent");
  }

  function handleSessionOpen(session) {
    if (session.mode === "boardroom") {
      setActiveTab("boardroom");
    } else if (session.mode === "agent" && session.agent) {
      setSelectedAgent(session.agent);
      setActiveTab("agent");
    } else {
      setActiveTab("quick");
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-label="Open command interface"
        aria-expanded={open}
        title="Command interface (Cmd+K)"
      >
        <span className={styles.triggerIcon}>CMD</span>
        {totalBadge > 0 && (
          <span className={styles.triggerBadge}>{totalBadge > 99 ? "99+" : totalBadge}</span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-up panel */}
      <div
        className={[styles.panel, open ? styles.panelOpen : ""].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Command interface"
      >
        {/* Panel header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>Command</div>
          <div className={styles.panelMeta}>
            {workspace?.name && <span className={styles.wsName}>{workspace.name}</span>}
            {totalBadge > 0 && (
              <span className={styles.headerBadge}>{totalBadge} pending</span>
            )}
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close command interface"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs} role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={[styles.tab, activeTab === tab.id ? styles.tabActive : ""].join(" ")}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.id === "recent" && unresolvedCount > 0 && (
                <span className={styles.tabBadge}>{unresolvedCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Panel body */}
        <div className={styles.panelBody}>
          {/* Quick Question */}
          {activeTab === "quick" && (
            <div className={styles.quickPane}>
              <form onSubmit={handleQuickSubmit} className={styles.quickForm}>
                <input
                  ref={inputRef}
                  className={styles.quickInput}
                  type="text"
                  placeholder="Ask anything about your business..."
                  value={quickMessage}
                  onChange={(e) => setQuickMessage(e.target.value)}
                  disabled={quickLoading}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className={styles.quickSend}
                  disabled={!quickMessage.trim() || quickLoading}
                  aria-label="Send"
                >
                  {quickLoading ? "..." : "Ask"}
                </button>
              </form>

              {quickError && (
                <div className={styles.quickError}>{quickError}</div>
              )}

              {quickResponse && (
                <div className={styles.quickResult}>
                  <div className={styles.quickResultMeta}>
                    <span
                      className={styles.quickSource}
                      style={{
                        background: quickResponse.source === 'anthropic' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                        color: quickResponse.source === 'anthropic' ? 'var(--color-success)' : 'var(--color-warning)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {quickResponse.source === 'anthropic' ? '✦ AI' : '⚡ Data-driven'}
                    </span>
                  </div>
                  <div className={styles.quickText}>{quickResponse.response}</div>
                  <button
                    className={styles.quickClear}
                    onClick={() => setQuickResponse(null)}
                  >
                    Clear
                  </button>
                </div>
              )}

              {!quickResponse && !quickLoading && (
                <div className={styles.agentShortcuts}>
                  <div className={styles.shortcutsLabel}>Or talk directly to an agent</div>
                  <div className={styles.agentGrid}>
                    {Object.entries(AgentMeta).map(([key, meta]) => (
                      <button
                        key={key}
                        className={styles.agentShortcut}
                        onClick={() => handleAgentSelect(key)}
                        style={{ borderColor: meta.color }}
                      >
                        <span className={styles.agentShortcutIcon} style={{ background: meta.bg, color: meta.color }}>
                          {meta.icon}
                        </span>
                        <span className={styles.agentShortcutLabel}>{meta.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agent Direct */}
          {activeTab === "agent" && (
            <div className={styles.agentPane}>
              {!selectedAgent ? (
                <div className={styles.agentSelect}>
                  <div className={styles.agentSelectLabel}>Select an agent to talk to</div>
                  <div className={styles.agentList}>
                    {Object.entries(AgentMeta).map(([key, meta]) => (
                      <button
                        key={key}
                        className={styles.agentSelectBtn}
                        onClick={() => setSelectedAgent(key)}
                        style={{ borderLeftColor: meta.color }}
                      >
                        <span className={styles.agentSelectIcon} style={{ background: meta.bg, color: meta.color }}>
                          {meta.icon}
                        </span>
                        <div className={styles.agentSelectInfo}>
                          <span className={styles.agentSelectName}>{meta.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <AgentChat
                  agent={selectedAgent}
                  onBack={() => setSelectedAgent(null)}
                />
              )}
            </div>
          )}

          {/* Boardroom */}
          {activeTab === "boardroom" && (
            <div className={styles.boardroomPane}>
              <Boardroom />
            </div>
          )}

          {/* Recent */}
          {activeTab === "recent" && (
            <div className={styles.recentPane}>
              <ConversationHistory onOpen={handleSessionOpen} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
