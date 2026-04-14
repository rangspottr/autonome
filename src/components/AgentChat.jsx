import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta, { DEFAULT_AGENT_META } from "./AgentMeta.js";
import styles from "./AgentChat.module.css";

function relTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function parseActionItems(text) {
  const items = [];
  const approvalRe = /\[APPROVAL NEEDED\][^\n]*/g;
  const actionRe = /\[ACTION\][^\n]*/g;
  let match;
  while ((match = approvalRe.exec(text)) !== null) {
    items.push({ type: "approval", text: match[0].replace("[APPROVAL NEEDED]", "").trim() });
  }
  while ((match = actionRe.exec(text)) !== null) {
    items.push({ type: "action", text: match[0].replace("[ACTION]", "").trim() });
  }
  return items;
}

function formatMessageText(text) {
  return text
    .replace(/\[APPROVAL NEEDED\]/g, "")
    .replace(/\[ACTION\]/g, "")
    .replace(/\[BLOCKER\]/g, "")
    .trim();
}

function InlineActions({ items, onAction, loading }) {
  if (!items.length) return null;
  return (
    <div className={styles.actionItems}>
      {items.map((item, i) => (
        <div key={i} className={styles.actionItem}>
          <div className={styles.actionItemText}>{item.text || "Action required"}</div>
          <div className={styles.actionBtns}>
            {item.type === "approval" && (
              <>
                <button
                  className={[styles.actionBtn, styles.actionBtnApprove].join(" ")}
                  onClick={() => onAction("approve", i)}
                  disabled={loading}
                >
                  Approve
                </button>
                <button
                  className={[styles.actionBtn, styles.actionBtnReject].join(" ")}
                  onClick={() => onAction("reject", i)}
                  disabled={loading}
                >
                  Reject
                </button>
                <button
                  className={[styles.actionBtn, styles.actionBtnDefer].join(" ")}
                  onClick={() => onAction("defer", i)}
                  disabled={loading}
                >
                  Defer
                </button>
              </>
            )}
            {item.type === "action" && (
              <button
                className={[styles.actionBtn, styles.actionBtnFollow].join(" ")}
                onClick={() => onAction("follow_up", i)}
                disabled={loading}
              >
                Ask more
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AgentChat({ agent, sessionId: initialSessionId, onBack }) {
  const meta = AgentMeta[agent] || DEFAULT_AGENT_META;
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(initialSessionId || null);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const data = await api.get(`/agents/${agent}/actions?limit=3`);
      const memData = await api.get(`/agents/${agent}/memory`).catch(() => ({ memories: [] }));
      const workData = await api.get(`/agents/${agent}/workstream`).catch(() => ({}));
      setBriefing({
        actions: data.actions || [],
        memory: memData.memories || [],
        workstream: workData,
      });
    } catch {
      setBriefing({ actions: [], memory: [], workstream: {} });
    } finally {
      setBriefingLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setSending(true);
    setError(null);

    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    try {
      const data = await api.post("/command/agent-chat", {
        agent,
        message: userMsg,
        session_id: sessionId,
      });
      setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          source: data.source,
          ai_attempted: data.ai_attempted || false,
          ai_error: data.ai_error || null,
          provider_attempted: data.provider_attempted || null,
          context_summary: data.context_summary,
          actionItems: parseActionItems(data.response),
        },
      ]);
    } catch (err) {
      setError(err.message || "Failed to get response");
      setMessages((prev) => prev.slice(0, -1));
      setInput(userMsg);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function handleAction(actionType, itemIndex) {
    setActionLoading(true);
    try {
      await api.post("/command/action", {
        action: actionType,
        agent,
        session_id: sessionId,
        metadata: { description: `Item ${itemIndex + 1} from agent response` },
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Action "${actionType}" recorded. The agent will follow up.`,
        },
      ]);
    } catch (err) {
      setError(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header} style={{ borderBottomColor: meta.color }}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack} aria-label="Back">
            ←
          </button>
        )}
        <div className={styles.agentIcon} style={{ background: meta.bg, color: meta.color }}>
          {meta.icon}
        </div>
        <div className={styles.agentInfo}>
          <span className={styles.agentName} style={{ color: meta.color }}>{meta.label}</span>
          <span className={styles.agentRole}>Agent</span>
        </div>
        {briefing && (
          <div className={styles.statusRow}>
            {briefing.workstream?.pendingDecisions > 0 && (
              <span className={styles.statusPill}>{briefing.workstream.pendingDecisions} pending</span>
            )}
            {briefing.workstream?.blockers?.length > 0 && (
              <span className={[styles.statusPill, styles.statusPillDanger].join(" ")}>
                {briefing.workstream.blockers.length} blocker{briefing.workstream.blockers.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages / briefing */}
      <div className={styles.messages}>
        {/* Briefing panel — shown before first message */}
        {messages.length === 0 && (
          <div className={styles.briefing}>
            {briefingLoading ? (
              <div className={styles.briefingLoading}>Loading agent briefing...</div>
            ) : briefing ? (
              <>
                {briefing.workstream && (
                  <div className={styles.briefingSection}>
                    <div className={styles.briefingSectionTitle}>Current Status</div>
                    <div className={styles.briefingStats}>
                      <div className={styles.briefingStat}>
                        <span className={styles.briefingStatVal}>{briefing.workstream.activeWorkflows || 0}</span>
                        <span className={styles.briefingStatLabel}>workflows</span>
                      </div>
                      <div className={styles.briefingStat}>
                        <span className={styles.briefingStatVal}>{briefing.workstream.pendingDecisions || 0}</span>
                        <span className={styles.briefingStatLabel}>pending</span>
                      </div>
                      <div className={styles.briefingStat}>
                        <span className={styles.briefingStatVal}>{briefing.actions.length}</span>
                        <span className={styles.briefingStatLabel}>recent actions</span>
                      </div>
                    </div>
                  </div>
                )}

                {briefing.actions.length > 0 && (
                  <div className={styles.briefingSection}>
                    <div className={styles.briefingSectionTitle}>Recent Actions</div>
                    {briefing.actions.slice(0, 3).map((a) => (
                      <div key={a.id} className={styles.briefingItem}>
                        <span className={[styles.briefingItemTag, a.outcome === "completed" ? styles.tagSuccess : styles.tagMuted].join(" ")}>
                          {a.outcome}
                        </span>
                        <span className={styles.briefingItemText}>{a.description}</span>
                        <span className={styles.briefingItemTime}>{relTime(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {briefing.workstream?.blockers?.length > 0 && (
                  <div className={styles.briefingSection}>
                    <div className={styles.briefingSectionTitle}>Active Blockers</div>
                    {briefing.workstream.blockers.slice(0, 3).map((b, i) => (
                      <div key={i} className={[styles.briefingItem, styles.briefingItemBlocker].join(" ")}>
                        {b}
                      </div>
                    ))}
                  </div>
                )}

                {briefing.memory.length > 0 && (
                  <div className={styles.briefingSection}>
                    <div className={styles.briefingSectionTitle}>Memory Highlights</div>
                    {briefing.memory.slice(0, 3).map((m) => (
                      <div key={m.id} className={styles.briefingItem}>
                        <span className={styles.briefingItemTag}>{m.memory_type}</span>
                        <span className={styles.briefingItemText}>{m.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.briefingPrompt}>
                  Start the conversation to get a full briefing from this agent.
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={[
              styles.message,
              msg.role === "user" ? styles.messageUser : "",
              msg.role === "system" ? styles.messageSystem : "",
            ].join(" ")}
          >
            {msg.role === "assistant" && (
              <div className={styles.messageAgent} style={{ background: meta.bg, color: meta.color }}>
                {meta.icon}
              </div>
            )}
            <div className={styles.messageBubble}>
              <div className={styles.messageText}>{formatMessageText(msg.content)}</div>
              {msg.role === "assistant" && msg.actionItems?.length > 0 && (
                <InlineActions
                  items={msg.actionItems}
                  onAction={handleAction}
                  loading={actionLoading}
                />
              )}
              {msg.role === "assistant" && msg.context_summary && (
                <div className={styles.contextSummary}>
                  Grounded on: {msg.context_summary.actions} actions, {msg.context_summary.memory} memories, {msg.context_summary.events} events
                </div>
              )}
              {msg.role === "assistant" && msg.source && (
                <div className={styles.messageSource}>{msg.source}</div>
              )}
              {msg.role === "assistant" && msg.ai_attempted && msg.source === "local" && (
                <div className={styles.aiFallbackNotice}>
                  AI call to {msg.provider_attempted || "configured AI provider"} failed — showing data-driven summary.
                  {msg.ai_error && <span className={styles.aiFallbackError}>{msg.ai_error}</span>}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className={styles.message}>
            <div className={styles.messageAgent} style={{ background: meta.bg, color: meta.color }}>
              {meta.icon}
            </div>
            <div className={styles.messageBubble}>
              <div className={styles.typingIndicator}>
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorMsg}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form className={styles.inputArea} onSubmit={handleSend}>
        <input
          ref={inputRef}
          className={styles.chatInput}
          type="text"
          placeholder={`Ask ${meta.label} agent...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          autoComplete="off"
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!input.trim() || sending}
          aria-label="Send message"
          style={{ background: meta.color }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
