import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Pill from "../components/Pill.jsx";
import styles from "./SettingsView.module.css";

export default function SettingsView() {
  const { workspace } = useAuth();

  const [limits, setLimits] = useState({
    maxAutoSpend: 500,
    refundThreshold: 100,
    approvalAbove: 5000,
    dailyEmailLimit: 50,
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [csvStatus, setCsvStatus] = useState(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvInputRef = useRef(null);

  const [integrations, setIntegrations] = useState(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [aiStatusData, setAiStatusData] = useState(null);

  const [webhookKey, setWebhookKey] = useState(null);
  const [webhookKeyLoading, setWebhookKeyLoading] = useState(true);
  const [webhookKeyCopied, setWebhookKeyCopied] = useState(false);
  const [webhookKeyGenerating, setWebhookKeyGenerating] = useState(false);

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [error, setError] = useState(null);

  useEffect(() => {
    if (workspace?.settings?.riskLimits) {
      const rl = workspace.settings.riskLimits;
      setLimits({
        maxAutoSpend: rl.maxAutoSpend ?? 500,
        refundThreshold: rl.refundThreshold ?? 100,
        approvalAbove: rl.approvalAbove ?? 5000,
        dailyEmailLimit: rl.dailyEmailLimit ?? 50,
      });
    }
  }, [workspace]);

  useEffect(() => {
    api.get('/settings/integrations')
      .then(setIntegrations)
      .catch(() => setIntegrations(null))
      .finally(() => setIntegrationsLoading(false));

    api.get('/settings/ai-status')
      .then(setAiStatusData)
      .catch(() => setAiStatusData(null));

    api.get('/webhooks/key')
      .then((data) => setWebhookKey(data.key))
      .catch(() => setWebhookKey(null))
      .finally(() => setWebhookKeyLoading(false));

    api.get('/metrics/summary')
      .then(setMetrics)
      .catch(() => setMetrics(null))
      .finally(() => setMetricsLoading(false));
  }, []);

  async function generateWebhookKey() {
    setWebhookKeyGenerating(true);
    try {
      const data = await api.post('/webhooks/generate-key', {});
      setWebhookKey(data.key);
    } catch {
      // silently fail
    } finally {
      setWebhookKeyGenerating(false);
    }
  }

  function copyWebhookKey() {
    if (!webhookKey) return;
    navigator.clipboard.writeText(webhookKey).then(() => {
      setWebhookKeyCopied(true);
      setTimeout(() => setWebhookKeyCopied(false), 2000);
    });
  }

  function parseCSVText(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const sep = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    return lines.slice(1).map((line) => {
      const vals = line.split(sep);
      const row = {};
      headers.forEach((h, i) => { row[h] = (vals[i] || "").trim(); });
      return row;
    }).filter((r) => Object.values(r).some((v) => v));
  }

  async function handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvStatus(null);

    try {
      const text = await file.text();
      const rows = parseCSVText(text);
      if (rows.length === 0) {
        setCsvStatus("No data rows found.");
        setCsvImporting(false);
        return;
      }

      let imported = 0;
      let failed = 0;

      for (const row of rows) {
        const name = row.name || row.fullname || row.contactname || row.company;
        const email = row.email || row.emailaddress;
        const phone = row.phone || row.phonenumber || row.mobile;
        if (name) {
          try {
            await api.post('/contacts', {
              name,
              email: email || null,
              phone: phone || null,
              type: "lead",
            });
            imported++;
          } catch {
            failed++;
          }
        }
      }

      const parts = [`Imported ${imported} contacts from ${file.name}`];
      if (failed > 0) parts.push(`(${failed} failed)`);
      setCsvStatus(parts.join(" "));
    } catch (err) {
      setCsvStatus(`Error: ${err.message}`);
    } finally {
      setCsvImporting(false);
    }
    e.target.value = "";
  }

  async function saveSettings() {
    if (!workspace) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch('/workspaces/' + workspace.id, {
        settings: {
          ...workspace.settings,
          riskLimits: {
            maxAutoSpend: Number(limits.maxAutoSpend),
            refundThreshold: Number(limits.refundThreshold),
            approvalAbove: Number(limits.approvalAbove),
            dailyEmailLimit: Number(limits.dailyEmailLimit),
          },
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function resetSetup() {
    if (!workspace) return;
    if (!window.confirm("Reset onboarding? Your data will be preserved.")) return;
    try {
      await api.patch('/workspaces/' + workspace.id, {
        settings: {
          ...workspace.settings,
          setupCompleted: false,
        },
      });
      window.location.reload();
    } catch (err) {
      setError(err.message || "Failed to reset onboarding.");
    }
  }

  const checks = metrics
    ? [
        { label: "Business configured", done: !!metrics.businessConfigured },
        { label: "Contacts added", done: (metrics.contactCount ?? 0) > 0 },
        { label: "Transactions added", done: (metrics.transactionCount ?? 0) > 0 },
        { label: "Deals in pipeline", done: (metrics.dealCount ?? 0) > 0 },
        { label: "First cycle completed", done: !!metrics.firstCycleCompleted },
      ]
    : [];
  const checksDone = checks.filter((c) => c.done).length;

  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:3001/api';
  const webhookBase = apiBase.replace(/\/api$/, '');

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Settings</h2>
          <div className={styles.pageSubtitle}>Configure integrations, risk limits, and platform preferences.</div>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Activation Checklist */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Activation Checklist</h3>
        <Card>
          <div className={styles.checklistHeader}>
            <h4 className={styles.checklistTitle}>Setup Progress</h4>
            {!metricsLoading && metrics && (
              <span
                className={styles.checklistProgress}
                style={{ color: checksDone === checks.length ? "var(--color-success)" : "var(--color-warning)" }}
              >
                {checksDone}/{checks.length} complete
              </span>
            )}
          </div>
          {metricsLoading ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading...</div>
          ) : metrics ? (
            checks.map((c) => (
              <div key={c.label} className={styles.checkRow}>
                <span
                  className={styles.checkIcon}
                  style={{ color: c.done ? "var(--color-success)" : "var(--color-text-muted)" }}
                >
                  {c.done ? "✓" : "○"}
                </span>
                <span
                  className={styles.checkLabel}
                  style={{ color: c.done ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                >
                  {c.label}
                </span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Unable to load checklist data.</div>
          )}
        </Card>
      </div>

      {/* Integration Status */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Integration Status</h3>
        {integrationsLoading ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading...</div>
        ) : integrations ? (
          <div className={styles.integrationGrid}>
            {[
              { label: "Email (SMTP)", key: "email" },
              { label: "SMS (Twilio)", key: "sms" },
              { label: "AI (Anthropic)", key: "ai" },
              { label: "Stripe Billing", key: "stripe" },
            ].map((item) => (
              <div key={item.key} className={styles.integrationCard}>
                <span className={styles.integrationName}>{item.label}</span>
                <Pill
                  label={integrations[item.key]?.configured ? "Configured" : "Not configured"}
                  variant={integrations[item.key]?.configured ? "green" : "muted"}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Unable to load integration status.</div>
        )}
      </div>

      {/* AI Provider Status */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>AI Provider</h3>
        <Card>
          {aiStatusData ? (
            <div>
              <div className={styles.integrationCard} style={{ marginBottom: "var(--space-3)" }}>
                <span className={styles.integrationName}>Provider</span>
                <Pill
                  label={aiStatusData.provider === "anthropic" ? "Anthropic Claude" : "Not configured"}
                  variant={aiStatusData.connected ? "green" : "muted"}
                />
              </div>
              {aiStatusData.model && (
                <div className={styles.integrationCard} style={{ marginBottom: "var(--space-3)" }}>
                  <span className={styles.integrationName}>Model</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                    {aiStatusData.model}
                  </span>
                </div>
              )}
              <div className={styles.integrationCard} style={{ marginBottom: "var(--space-3)" }}>
                <span className={styles.integrationName}>Connection</span>
                <Pill
                  label={aiStatusData.connected ? "Connected" : "Limited Mode"}
                  variant={aiStatusData.connected ? "green" : "amber"}
                />
              </div>
              {!aiStatusData.connected && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-2)", padding: "var(--space-2) var(--space-3)", background: "rgba(245,158,11,0.07)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  Set the <code style={{ fontSize: "var(--text-xs)" }}>ANTHROPIC_API_KEY</code> environment variable to enable full AI responses.
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading AI status…</div>
          )}
        </Card>
      </div>

      {/* Webhook Integration */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Webhook Integration</h3>
        <Card>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-4)" }}>
            Use these endpoints to ingest leads, payments, and events from external systems.
          </div>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>Endpoint URLs</div>
            {[
              { path: "/api/webhooks/lead", desc: "Ingest a new lead/contact" },
              { path: "/api/webhooks/payment", desc: "Ingest a payment notification" },
              { path: "/api/webhooks/event", desc: "Ingest a generic event" },
            ].map((ep) => (
              <div key={ep.path} className={styles.webhookEndpoint}>
                <code className={styles.webhookCode}>POST {webhookBase}{ep.path}</code>
                <span className={styles.webhookDesc}>{ep.desc}</span>
              </div>
            ))}
            <div className={styles.webhookNote}>
              Include <code className={styles.inlineCode}>x-api-key: YOUR_KEY</code> header with each request.
            </div>
          </div>

          <div>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>Webhook API Key</div>
            {webhookKeyLoading ? (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading...</div>
            ) : (
              <div className={styles.webhookKeyRow}>
                <code
                  className={styles.webhookKeyDisplay}
                  style={{ color: webhookKey ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                >
                  {webhookKey
                    ? `${webhookKey.slice(0, 8)}${"•".repeat(Math.max(0, webhookKey.length - 12))}${webhookKey.slice(-4)}`
                    : "No key generated yet"}
                </code>
                {webhookKey && (
                  <Button size="sm" variant="secondary" onClick={copyWebhookKey}>
                    {webhookKeyCopied ? "Copied!" : "Copy"}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={generateWebhookKey} disabled={webhookKeyGenerating}>
                  {webhookKeyGenerating ? "..." : webhookKey ? "Regenerate" : "Generate Key"}
                </Button>
              </div>
            )}
            {webhookKey && (
              <div className={styles.webhookWarning}>
                Keep this key secret. Regenerating will invalidate the previous key.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Risk Limits */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Risk & Approval Limits</h3>
        <Card>
          <div className={styles.formGrid}>
            {[
              ["maxAutoSpend", "Max Auto-Spend ($)"],
              ["approvalAbove", "Approval Required Above ($)"],
              ["refundThreshold", "Refund Threshold ($)"],
              ["dailyEmailLimit", "Daily Email Limit"],
            ].map(([k, label]) => (
              <Input
                key={k}
                label={label}
                type="number"
                value={String(limits[k])}
                onChange={(v) => setLimits((l) => ({ ...l, [k]: v }))}
                style={{ marginBottom: 0 }}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Data Import */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Data Import</h3>
        <Card>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
            Import contacts from a CSV, TSV, or TXT file. Columns should include: name, email, phone.
          </p>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleCsvImport}
            style={{ display: "none" }}
          />
          <Button variant="secondary" onClick={() => csvInputRef.current?.click()} disabled={csvImporting}>
            {csvImporting ? "Importing..." : "Import CSV / TSV"}
          </Button>
          {csvStatus && (
            <div
              className={styles.csvStatus}
              style={{ color: csvStatus.startsWith("Error") ? "var(--color-danger)" : "var(--color-success)" }}
            >
              {csvStatus}
            </div>
          )}
        </Card>
      </div>

      <div className={styles.actions}>
        <Button onClick={saveSettings} disabled={saving}>{saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}</Button>
        <Button variant="secondary" onClick={resetSetup}>Reset Onboarding</Button>
      </div>
    </div>
  );
}
