import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import AgentMeta from "../components/AgentMeta.js";
import Button from "../components/Button.jsx";
import styles from "./AutonomyView.module.css";

const AGENTS = ["finance", "revenue", "operations", "growth", "support"];

const RISK_LABELS = {
  conservative: { label: "Conservative", desc: "Lower thresholds, more approvals", color: "var(--color-success)" },
  moderate: { label: "Moderate", desc: "Balanced automation", color: "var(--color-brand)" },
  aggressive: { label: "Aggressive", desc: "Higher thresholds, fewer approvals", color: "var(--color-warning)" },
};

function AgentCard({ agent, settings, globalSettings, onSave }) {
  const meta = AgentMeta[agent];
  const effective = settings || {};
  const global = globalSettings || {};

  const [enabled, setEnabled] = useState(effective.enabled ?? true);
  const [autoThreshold, setAutoThreshold] = useState(effective.auto_execute_threshold ?? global.auto_execute_threshold ?? 500);
  const [approvalThreshold, setApprovalThreshold] = useState(effective.approval_threshold ?? global.approval_threshold ?? 5000);
  const [riskTolerance, setRiskTolerance] = useState(effective.risk_tolerance ?? global.risk_tolerance ?? "moderate");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(agent, { enabled, auto_execute_threshold: autoThreshold, approval_threshold: approvalThreshold, risk_tolerance: riskTolerance });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={[styles.agentCard, !enabled ? styles.disabled : ""].join(" ")}>
      <div className={styles.agentCardHeader}>
        <div className={styles.agentInfo}>
          <div
            className={styles.agentAvatar}
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.icon}
          </div>
          <div>
            <div className={styles.agentName}>{meta.label}</div>
            <div className={styles.agentStatus}>{enabled ? "Active" : "Disabled"}</div>
          </div>
        </div>
        <label className={styles.toggle} aria-label={`${enabled ? "Disable" : "Enable"} ${meta.label} agent`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className={styles.toggleSlider} />
        </label>
      </div>

      {enabled && (
        <div className={styles.agentCardBody}>
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              Auto-execute threshold
              <span className={styles.settingHint}>Actions below this amount execute automatically</span>
            </label>
            <div className={styles.settingInput}>
              <span className={styles.inputPrefix}>$</span>
              <input
                type="number"
                className={styles.numInput}
                value={autoThreshold}
                onChange={(e) => setAutoThreshold(parseFloat(e.target.value) || 0)}
                min={0}
                step={100}
              />
            </div>
          </div>

          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              Approval threshold
              <span className={styles.settingHint}>Actions above this amount require approval</span>
            </label>
            <div className={styles.settingInput}>
              <span className={styles.inputPrefix}>$</span>
              <input
                type="number"
                className={styles.numInput}
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(parseFloat(e.target.value) || 0)}
                min={0}
                step={500}
              />
            </div>
          </div>

          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              Risk tolerance
              <span className={styles.settingHint}>How aggressively this agent acts</span>
            </label>
            <div className={styles.riskOptions}>
              {Object.entries(RISK_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  className={[styles.riskOption, riskTolerance === k ? styles.riskActive : ""].join(" ")}
                  style={riskTolerance === k ? { borderColor: v.color, background: v.color + "15" } : {}}
                  onClick={() => setRiskTolerance(k)}
                  type="button"
                >
                  <span className={styles.riskLabel} style={riskTolerance === k ? { color: v.color } : {}}>
                    {v.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.agentCardFooter}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
            >
              {saved ? "✓ Saved" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
      {!enabled && (
        <div className={styles.agentCardFooter}>
          <Button variant="secondary" size="sm" onClick={handleSave} loading={saving}>
            {saved ? "✓ Saved" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AutonomyView() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalSaved, setGlobalSaved] = useState(false);
  const [error, setError] = useState(null);

  // Global form
  const [maxEmailsPerDay, setMaxEmailsPerDay] = useState(50);
  const [maxActionsPerCycle, setMaxActionsPerCycle] = useState(20);
  const [escalationDelayHours, setEscalationDelayHours] = useState(24);
  const [globalRisk, setGlobalRisk] = useState("moderate");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get("/autonomy-settings");
      setSettings(data);
      const g = data.global || data.defaults || {};
      setMaxEmailsPerDay(g.max_daily_emails ?? 50);
      setMaxActionsPerCycle(g.max_auto_actions_per_cycle ?? 20);
      setEscalationDelayHours(g.escalation_delay_hours ?? 24);
      setGlobalRisk(g.risk_tolerance ?? "moderate");
      setQuietStart(g.quiet_hours_start || "");
      setQuietEnd(g.quiet_hours_end || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function saveGlobal() {
    setGlobalSaving(true);
    try {
      const updated = await api.patch("/autonomy-settings", {
        max_daily_emails: maxEmailsPerDay,
        max_auto_actions_per_cycle: maxActionsPerCycle,
        escalation_delay_hours: escalationDelayHours,
        risk_tolerance: globalRisk,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
      });
      setSettings((prev) => ({ ...prev, global: updated }));
      setGlobalSaved(true);
      setTimeout(() => setGlobalSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setGlobalSaving(false);
    }
  }

  async function saveAgent(agent, agentSettings) {
    const updated = await api.patch(`/autonomy-settings/${agent}`, agentSettings);
    setSettings((prev) => ({
      ...prev,
      agents: { ...(prev?.agents || {}), [agent]: updated },
    }));
  }

  if (loading) {
    return (
      <div className={styles.view}>
        <div className={styles.loading}>Loading autonomy settings…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.view}>
        <div className={styles.error}>Could not load settings: {error}</div>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Autonomy Controls</h2>
          <p className={styles.pageDesc}>
            Control how autonomously agents operate — thresholds, approval requirements, quiet hours, and risk tolerance.
          </p>
        </div>
      </div>

      {/* Global settings */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Global Settings</h3>
        <div className={styles.globalCard}>
          <div className={styles.globalGrid}>
            <div className={styles.settingRow}>
              <label className={styles.settingLabel}>
                Max emails per day
                <span className={styles.settingHint}>Cap on daily outbound emails</span>
              </label>
              <input
                type="number"
                className={styles.numInput}
                value={maxEmailsPerDay}
                onChange={(e) => setMaxEmailsPerDay(parseInt(e.target.value) || 0)}
                min={0}
                max={500}
              />
            </div>

            <div className={styles.settingRow}>
              <label className={styles.settingLabel}>
                Max auto-actions per cycle
                <span className={styles.settingHint}>Actions executed per 15-min cycle</span>
              </label>
              <input
                type="number"
                className={styles.numInput}
                value={maxActionsPerCycle}
                onChange={(e) => setMaxActionsPerCycle(parseInt(e.target.value) || 0)}
                min={0}
                max={100}
              />
            </div>

            <div className={styles.settingRow}>
              <label className={styles.settingLabel}>
                Escalation delay (hours)
                <span className={styles.settingHint}>Hours before escalating to owner</span>
              </label>
              <input
                type="number"
                className={styles.numInput}
                value={escalationDelayHours}
                onChange={(e) => setEscalationDelayHours(parseInt(e.target.value) || 0)}
                min={0}
                max={168}
              />
            </div>

            <div className={styles.settingRow}>
              <label className={styles.settingLabel}>
                Global risk tolerance
              </label>
              <div className={styles.riskOptions}>
                {Object.entries(RISK_LABELS).map(([k, v]) => (
                  <button
                    key={k}
                    className={[styles.riskOption, globalRisk === k ? styles.riskActive : ""].join(" ")}
                    style={globalRisk === k ? { borderColor: v.color, background: v.color + "15" } : {}}
                    onClick={() => setGlobalRisk(k)}
                    type="button"
                  >
                    <span className={styles.riskLabel} style={globalRisk === k ? { color: v.color } : {}}>
                      {v.label}
                    </span>
                    <span className={styles.riskDesc}>{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingRow}>
              <label className={styles.settingLabel}>
                Quiet hours
                <span className={styles.settingHint}>No communications during these hours</span>
              </label>
              <div className={styles.timeRange}>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  aria-label="Quiet hours start"
                />
                <span className={styles.timeSep}>to</span>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  aria-label="Quiet hours end"
                />
              </div>
            </div>
          </div>

          <div className={styles.globalFooter}>
            <Button variant="primary" onClick={saveGlobal} loading={globalSaving}>
              {globalSaved ? "✓ Saved" : "Save global settings"}
            </Button>
          </div>
        </div>
      </div>

      {/* Per-agent settings */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Per-Agent Settings</h3>
        <p className={styles.sectionDesc}>
          Override global settings for individual agents.
        </p>
        <div className={styles.agentGrid}>
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent}
              agent={agent}
              settings={settings?.agents?.[agent] || null}
              globalSettings={settings?.global || settings?.defaults}
              onSave={saveAgent}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
