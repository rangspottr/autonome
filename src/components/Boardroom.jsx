import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";
import AgentMeta, { DEFAULT_AGENT_META } from "./AgentMeta.js";
import styles from "./Boardroom.module.css";

const ALL_AGENTS = Object.keys(AgentMeta);

function formatResponse(text) {
  return text
    .replace(/\[APPROVAL NEEDED\]/g, "")
    .replace(/\[ACTION\]/g, "")
    .replace(/\[BLOCKER\]/g, "")
    .trim();
}

function SynthesisSection({ synthesis, sessionId, onAction }) {
  const [actionLoading, setActionLoading] = useState(false);

  async function handleAction(item, actionType) {
    setActionLoading(true);
    try {
      await api.post("/command/action", {
        action: actionType,
        agent: item.agent,
        session_id: sessionId,
        metadata: { description: item.item || item.action },
      });
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
      if (onAction) onAction();
    }
  }

  return (
    <div className={styles.synthesis}>
      <div className={styles.synthesisHeader}>Synthesis</div>

      {synthesis.recommendation && (
        <div className={styles.recommendation}>
          <div className={styles.synthLabel}>Recommendation</div>
          <div className={styles.synthText}>{synthesis.recommendation}</div>
        </div>
      )}

      {synthesis.conflicts?.length > 0 && (
        <div className={styles.conflicts}>
          <div className={styles.synthLabel}>Points of Disagreement</div>
          {synthesis.conflicts.map((c, i) => (
            <div key={i} className={styles.conflictItem}>{c}</div>
          ))}
        </div>
      )}

      {synthesis.suggested_actions?.length > 0 && (
        <div className={styles.suggestedActions}>
          <div className={styles.synthLabel}>Suggested Actions</div>
          {synthesis.suggested_actions.map((a, i) => (
            <div key={i} className={[styles.suggestedAction, styles[`priority_${a.priority}`]].join(" ")}>
              <div className={styles.suggestedActionText}>{a.action}</div>
              <div className={styles.suggestedActionMeta}>
                <span className={styles.suggestedAgent}>{a.agent}</span>
                <span className={[styles.priorityTag, styles[`tag_${a.priority}`]].join(" ")}>{a.priority}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {synthesis.approval_needed?.length > 0 && (
        <div className={styles.approvalSection}>
          <div className={styles.synthLabel}>Approval Required</div>
          {synthesis.approval_needed.map((item, i) => (
            <div key={i} className={styles.approvalItem}>
              <div className={styles.approvalItemContent}>
                <div className={styles.approvalItemText}>{item.item}</div>
                {item.impact && <div className={styles.approvalImpact}>{item.impact}</div>}
              </div>
              <div className={styles.approvalBtns}>
                <button
                  className={[styles.approvalBtn, styles.approvalBtnApprove].join(" ")}
                  onClick={() => handleAction(item, "approve")}
                  disabled={actionLoading}
                >
                  Approve
                </button>
                <button
                  className={[styles.approvalBtn, styles.approvalBtnReject].join(" ")}
                  onClick={() => handleAction(item, "reject")}
                  disabled={actionLoading}
                >
                  Reject
                </button>
                <button
                  className={[styles.approvalBtn, styles.approvalBtnDefer].join(" ")}
                  onClick={() => handleAction(item, "defer")}
                  disabled={actionLoading}
                >
                  Defer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Boardroom({ sessionId: initialSessionId }) {
  const [selectedAgents, setSelectedAgents] = useState(ALL_AGENTS);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [exchanges, setExchanges] = useState([]);
  const [sessionId, setSessionId] = useState(initialSessionId || null);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges]);

  function toggleAgent(agent) {
    setSelectedAgents((prev) =>
      prev.includes(agent) ? prev.filter((a) => a !== agent) : [...prev, agent]
    );
  }

  function toggleAll() {
    setSelectedAgents((prev) =>
      prev.length === ALL_AGENTS.length ? [] : [...ALL_AGENTS]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim() || loading || selectedAgents.length === 0) return;
    const userMsg = message.trim();
    setMessage("");
    setLoading(true);
    setError(null);

    try {
      const data = await api.post("/command/boardroom", {
        message: userMsg,
        agents: selectedAgents,
        session_id: sessionId,
      });
      setSessionId(data.session_id);
      setExchanges((prev) => [
        ...prev,
        {
          userMessage: userMsg,
          agentsResponses: data.agents_responses,
          synthesis: data.synthesis,
        },
      ]);
    } catch (err) {
      setError(err.message || "Boardroom session failed");
      setMessage(userMsg);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className={styles.root}>
      {/* Agent selector */}
      <div className={styles.agentSelector}>
        <button
          className={[styles.selectAllBtn, selectedAgents.length === ALL_AGENTS.length ? styles.selectAllActive : ""].join(" ")}
          onClick={toggleAll}
        >
          {selectedAgents.length === ALL_AGENTS.length ? "Deselect All" : "Select All"}
        </button>
        <div className={styles.agentChips}>
          {ALL_AGENTS.map((agent) => {
            const meta = AgentMeta[agent];
            const active = selectedAgents.includes(agent);
            return (
              <button
                key={agent}
                className={[styles.agentChip, active ? styles.agentChipActive : ""].join(" ")}
                onClick={() => toggleAgent(agent)}
                style={active ? { background: meta.bg, color: meta.color, borderColor: meta.color } : {}}
                title={meta.description}
              >
                <span className={styles.chipIcon}>{meta.icon}</span>
                <span className={styles.chipLabel}>{meta.label}</span>
                {meta.focus && <span className={styles.chipFocus}>{meta.focus}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Exchange history */}
      <div className={styles.exchanges}>
        {exchanges.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Your AI Team is Ready</div>
            <div className={styles.emptyDesc}>
              Your boardroom is ready. Select agents above and ask any business question — pricing strategy, operational priorities, risk assessment. Each specialist will analyze from their domain, followed by a synthesized recommendation.
            </div>
            <div className={styles.starterQuestions}>
              {[
                "How is my business doing this week?",
                "What are my biggest risks right now?",
                "Which deals should I focus on?",
              ].map((q) => (
                <button
                  key={q}
                  className={styles.starterQuestion}
                  onClick={() => setMessage(q)}
                  type="button"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {exchanges.map((exchange, i) => (
          <div key={i} className={styles.exchange}>
            {/* User message */}
            <div className={styles.userQuestion}>
              <span className={styles.questionLabel}>You</span>
              <span className={styles.questionText}>{exchange.userMessage}</span>
            </div>

            {/* Agent responses */}
            <div className={styles.agentResponses}>
              {exchange.agentsResponses.map((ar) => {
                const meta = AgentMeta[ar.agent] || DEFAULT_AGENT_META;
                return (
                  <div key={ar.agent} className={styles.agentResponse}>
                    <div className={styles.agentResponseHeader} style={{ borderLeftColor: meta.color }}>
                      <span className={styles.agentResponseIcon} style={{ background: meta.bg, color: meta.color }}>
                        {meta.icon}
                      </span>
                      <span className={styles.agentResponseName} style={{ color: meta.color }}>{meta.label}</span>
                      <span className={styles.agentResponseSource}>{ar.source}</span>
                      {ar.context_summary && (
                        <span className={styles.agentResponseCtx}>
                          {ar.context_summary.actions}a / {ar.context_summary.memory}m
                        </span>
                      )}
                    </div>
                    <div className={styles.agentResponseText}>
                       {formatResponse(ar.response)}
                    </div>
                    {ar.ai_attempted && ar.source === 'local' && (
                      <div className={styles.aiFallbackNotice}>
                        AI call to {ar.provider_attempted || 'configured AI provider'} failed — showing data-driven summary.
                        {ar.ai_error && <span className={styles.aiFallbackError}>{ar.ai_error}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Synthesis */}
            {exchange.synthesis && (
              <SynthesisSection
                synthesis={exchange.synthesis}
                sessionId={sessionId}
              />
            )}
          </div>
        ))}

        {loading && (
          <div className={styles.loadingExchange}>
            <div className={styles.loadingDots}>
              <span /><span /><span />
            </div>
            <span className={styles.loadingText}>Agents are responding...</span>
          </div>
        )}

        {error && (
          <div className={styles.errorMsg}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={styles.boardroomInput}
          type="text"
          placeholder={
            selectedAgents.length === 0
              ? "Select at least one agent..."
              : `Ask all ${selectedAgents.length} agent${selectedAgents.length !== 1 ? "s" : ""}...`
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!message.trim() || loading || selectedAgents.length === 0}
        >
          {loading ? "..." : "Ask"}
        </button>
      </form>
    </div>
  );
}
