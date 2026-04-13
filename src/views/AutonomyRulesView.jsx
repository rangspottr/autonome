import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import AgentMeta from "../components/AgentMeta.js";
import styles from "./AutonomyRulesView.module.css";

const AGENTS = ["finance", "revenue", "operations", "growth", "support"];

const AUTONOMY_MODES = {
  conservative: {
    label: "Conservative",
    desc: "Agents recommend actions but always ask before acting",
    color: "var(--color-success)",
  },
  moderate: {
    label: "Moderate",
    desc: "Agents handle routine tasks automatically, escalate important decisions",
    color: "var(--color-brand)",
  },
  aggressive: {
    label: "Aggressive",
    desc: "Agents act independently on most items, only escalate high-risk decisions",
    color: "var(--color-warning)",
  },
};

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleInfo}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint && <span className={styles.toggleHint}>{hint}</span>}
      </div>
      <label className={styles.toggle} aria-label={label}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.toggleSlider} />
      </label>
    </div>
  );
}

// ─── Per-Agent Override Card ──────────────────────────────────────────────────

function AgentOverrideCard({ agent, settings, globalSettings, onSave }) {
  const meta = AgentMeta[agent];
  const effective = settings || {};
  const global = globalSettings || {};
  const [enabled, setEnabled] = useState(effective.enabled ?? true);
  const [autoThreshold, setAutoThreshold] = useState(effective.auto_execute_threshold ?? global.auto_execute_threshold ?? 500);
  const [approvalThreshold, setApprovalThreshold] = useState(effective.approval_threshold ?? global.approval_threshold ?? 5000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(agent, { enabled, auto_execute_threshold: autoThreshold, approval_threshold: approvalThreshold });
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
          <div className={styles.agentAvatar} style={{ background: meta.bg, color: meta.color }}>
            {meta.icon}
          </div>
          <div>
            <div className={styles.agentName}>{meta.label}</div>
            <div className={styles.agentStatus}>{enabled ? "Active" : "Disabled"}</div>
          </div>
        </div>
        <label className={styles.toggle} aria-label={`${enabled ? "Disable" : "Enable"} ${meta.label}`}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className={styles.toggleSlider} />
        </label>
      </div>

      {enabled && (
        <div className={styles.agentCardBody}>
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              Auto-approve below
              <span className={styles.settingHint}>Actions below this amount are automatic</span>
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
              Require approval above
              <span className={styles.settingHint}>Actions above this amount need your sign-off</span>
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
        </div>
      )}

      <div className={styles.agentCardFooter}>
        <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
          {saved ? "✓ Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function AutonomyRulesView() {
  const { workspace } = useAuth();

  // Global autonomy mode (from autonomy-settings)
  const [globalMode, setGlobalMode] = useState("moderate");
  const [maxEmailsPerDay, setMaxEmailsPerDay] = useState(50);
  const [maxSmsPerDay, setMaxSmsPerDay] = useState(20);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [preferEmailOverSms, setPreferEmailOverSms] = useState(true);
  const [autoReminders, setAutoReminders] = useState(true);
  const [quietEnabled, setQuietEnabled] = useState(false);

  // Customer sensitivity toggles
  const [vipRequiresApproval, setVipRequiresApproval] = useState(true);
  const [escalateAngryCustomers, setEscalateAngryCustomers] = useState(true);
  const [strategicDealsVisible, setStrategicDealsVisible] = useState(true);
  const [neverAutoEscalateLegal, setNeverAutoEscalateLegal] = useState(true);

  // Approval thresholds from workspace settings
  const [limits, setLimits] = useState({
    maxAutoSpend: 500,
    refundThreshold: 100,
    approvalAbove: 5000,
  });

  const [agentSettings, setAgentSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get("/autonomy-settings");
      const g = data.global || data.defaults || {};
      setGlobalMode(g.risk_tolerance ?? "moderate");
      setMaxEmailsPerDay(g.max_daily_emails ?? 50);
      setMaxSmsPerDay(g.max_daily_sms ?? 20);
      setQuietStart(g.quiet_hours_start || "");
      setQuietEnd(g.quiet_hours_end || "");
      setQuietEnabled(!!(g.quiet_hours_start && g.quiet_hours_end));
      setAgentSettings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (workspace?.settings?.riskLimits) {
      const rl = workspace.settings.riskLimits;
      setLimits({
        maxAutoSpend: rl.maxAutoSpend ?? 500,
        refundThreshold: rl.refundThreshold ?? 100,
        approvalAbove: rl.approvalAbove ?? 5000,
      });
    }
  }, [workspace]);

  async function saveRules() {
    setSaving(true);
    setError(null);
    try {
      // Save global autonomy settings
      await api.patch("/autonomy-settings", {
        max_daily_emails: maxEmailsPerDay,
        max_daily_sms: maxSmsPerDay,
        risk_tolerance: globalMode,
        quiet_hours_start: quietEnabled ? (quietStart || null) : null,
        quiet_hours_end: quietEnabled ? (quietEnd || null) : null,
      });

      // Save risk limits to workspace settings
      if (workspace) {
        await api.patch(`/workspaces/${workspace.id}`, {
          settings: {
            ...workspace.settings,
            riskLimits: {
              maxAutoSpend: Number(limits.maxAutoSpend),
              refundThreshold: Number(limits.refundThreshold),
              approvalAbove: Number(limits.approvalAbove),
              dailyEmailLimit: maxEmailsPerDay,
            },
          },
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAgent(agent, agentData) {
    const updated = await api.patch(`/autonomy-settings/${agent}`, agentData);
    setAgentSettings((prev) => ({
      ...prev,
      agents: { ...(prev?.agents || {}), [agent]: updated },
    }));
  }

  if (loading) {
    return (
      <div className={styles.view}>
        <div className={styles.loading}>Loading autonomy rules…</div>
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Autonomy Rules</h2>
          <p className={styles.pageDesc}>
            Control how your AI team operates, when they act independently, and when they check with you.
          </p>
        </div>
        <Button variant="primary" onClick={saveRules} loading={saving}>
          {saved ? "✓ Saved" : "Save Rules"}
        </Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Section 1: Global Autonomy Mode */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Global Autonomy Mode</h3>
        <div className={styles.modeGrid}>
          {Object.entries(AUTONOMY_MODES).map(([k, v]) => (
            <button
              key={k}
              type="button"
              className={[styles.modeCard, globalMode === k ? styles.modeCardActive : ""].join(" ")}
              style={globalMode === k ? { borderColor: v.color, background: v.color + "12" } : {}}
              onClick={() => setGlobalMode(k)}
            >
              <div className={styles.modeLabel} style={globalMode === k ? { color: v.color } : {}}>{v.label}</div>
              <div className={styles.modeDesc}>{v.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: Approval Thresholds */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Approval Thresholds</h3>
        <Card>
          <div className={styles.thresholdGrid}>
            <Input
              label="Auto-approve actions below"
              type="number"
              value={String(limits.maxAutoSpend)}
              onChange={(v) => setLimits((l) => ({ ...l, maxAutoSpend: v }))}
              style={{ marginBottom: 0 }}
            />
            <Input
              label="Require approval above"
              type="number"
              value={String(limits.approvalAbove)}
              onChange={(v) => setLimits((l) => ({ ...l, approvalAbove: v }))}
              style={{ marginBottom: 0 }}
            />
            <Input
              label="Refund threshold"
              type="number"
              value={String(limits.refundThreshold)}
              onChange={(v) => setLimits((l) => ({ ...l, refundThreshold: v }))}
              style={{ marginBottom: 0 }}
            />
          </div>
        </Card>
      </div>

      {/* Section 3: Communication Limits */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Communication Limits</h3>
        <Card>
          <div className={styles.commGrid}>
            <div className={styles.commField}>
              <label className={styles.commLabel}>Daily email limit</label>
              <input
                type="number"
                className={styles.numInput}
                value={maxEmailsPerDay}
                onChange={(e) => setMaxEmailsPerDay(parseInt(e.target.value) || 0)}
                min={0}
                max={500}
              />
            </div>
            <div className={styles.commField}>
              <label className={styles.commLabel}>Daily SMS limit</label>
              <input
                type="number"
                className={styles.numInput}
                value={maxSmsPerDay}
                onChange={(e) => setMaxSmsPerDay(parseInt(e.target.value) || 0)}
                min={0}
                max={200}
              />
            </div>
          </div>
          <div className={styles.togglesGroup}>
            <ToggleRow
              label="Prefer email over SMS when both are available"
              checked={preferEmailOverSms}
              onChange={setPreferEmailOverSms}
            />
            <ToggleRow
              label="Appointment reminders sent automatically"
              checked={autoReminders}
              onChange={setAutoReminders}
            />
          </div>
        </Card>
      </div>

      {/* Section 4: Quiet Hours */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Quiet Hours</h3>
        <Card>
          <ToggleRow
            label="Enable quiet hours"
            hint="No outbound communication during these hours"
            checked={quietEnabled}
            onChange={setQuietEnabled}
          />
          {quietEnabled && (
            <div className={styles.quietTimes}>
              <div className={styles.timeField}>
                <label className={styles.commLabel}>Start time</label>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  aria-label="Quiet hours start"
                />
              </div>
              <span className={styles.timeSep}>to</span>
              <div className={styles.timeField}>
                <label className={styles.commLabel}>End time</label>
                <input
                  type="time"
                  className={styles.timeInput}
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  aria-label="Quiet hours end"
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Section 5: Customer Sensitivity */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Customer Sensitivity</h3>
        <Card>
          <div className={styles.togglesGroup}>
            <ToggleRow
              label="VIP accounts always require approval"
              checked={vipRequiresApproval}
              onChange={setVipRequiresApproval}
            />
            <ToggleRow
              label="Escalate angry or upset customers immediately"
              checked={escalateAngryCustomers}
              onChange={setEscalateAngryCustomers}
            />
            <ToggleRow
              label="Strategic deals visible to Revenue and Finance agents"
              checked={strategicDealsVisible}
              onChange={setStrategicDealsVisible}
            />
            <ToggleRow
              label="Never auto-escalate legal, refund, or pricing issues"
              checked={neverAutoEscalateLegal}
              onChange={setNeverAutoEscalateLegal}
            />
          </div>
        </Card>
      </div>

      {/* Section 6: Per-Agent Overrides */}
      <div className={styles.section}>
        <button
          type="button"
          className={styles.expandHeader}
          onClick={() => setAgentsExpanded((v) => !v)}
          aria-expanded={agentsExpanded}
        >
          <h3 className={styles.sectionTitle} style={{ margin: 0 }}>Per-Agent Overrides</h3>
          <span className={styles.expandIcon}>{agentsExpanded ? "▲" : "▼"}</span>
        </button>
        {agentsExpanded && (
          <div className={styles.agentGrid}>
            {AGENTS.map((agent) => (
              <AgentOverrideCard
                key={agent}
                agent={agent}
                settings={agentSettings?.agents?.[agent]}
                globalSettings={agentSettings?.global || agentSettings?.defaults}
                onSave={saveAgent}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles.saveRow}>
        <Button variant="primary" onClick={saveRules} loading={saving}>
          {saved ? "✓ Saved" : "Save Rules"}
        </Button>
      </div>
    </div>
  );
}
