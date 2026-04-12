import { useState, useRef, useEffect } from "react";
import { T } from "../lib/theme.js";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Pill from "../components/Pill.jsx";

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

  // Integration status from server
  const [integrations, setIntegrations] = useState(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);

  // Webhook key state
  const [webhookKey, setWebhookKey] = useState(null);
  const [webhookKeyLoading, setWebhookKeyLoading] = useState(true);
  const [webhookKeyCopied, setWebhookKeyCopied] = useState(false);
  const [webhookKeyGenerating, setWebhookKeyGenerating] = useState(false);

  // Activation checklist from metrics
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [error, setError] = useState(null);

  // Initialize risk limits from workspace settings
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

  // Fetch integrations, webhook key, and metrics in parallel
  useEffect(() => {
    api.get('/settings/integrations')
      .then(setIntegrations)
      .catch(() => setIntegrations(null))
      .finally(() => setIntegrationsLoading(false));

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
      // silently fail — key stays unchanged
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

  // Activation checklist derived from metrics
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
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Settings</h2>
        <div style={{ fontSize: 13, color: T.dm }}>Configure integrations, risk limits, and platform preferences.</div>
      </div>

      {error && (
        <Card style={{ marginBottom: 20, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ fontSize: 13, color: T.rd }}>{error}</div>
        </Card>
      )}

      {/* Activation Checklist */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.tx }}>Activation Checklist</h3>
          {!metricsLoading && metrics && (
            <span style={{ fontSize: 13, fontWeight: 600, color: checksDone === checks.length ? T.gn : T.am }}>
              {checksDone}/{checks.length} complete
            </span>
          )}
        </div>
        {metricsLoading ? (
          <div style={{ fontSize: 13, color: T.mt }}>Loading...</div>
        ) : metrics ? (
          checks.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.done ? T.gn : T.mt }}>{c.done ? "[x]" : "[ ]"}</span>
              <span style={{ fontSize: 13, color: c.done ? T.tx : T.mt }}>
                {c.label}
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 13, color: T.mt }}>Unable to load checklist data.</div>
        )}
      </Card>

      {/* Integration Status */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: T.tx }}>Integration Status</h3>
        {integrationsLoading ? (
          <div style={{ fontSize: 13, color: T.mt }}>Loading...</div>
        ) : integrations ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Email (SMTP)", key: "email", provider: integrations.email?.provider },
              { label: "SMS (Twilio)", key: "sms", provider: integrations.sms?.provider },
              { label: "AI (Anthropic)", key: "ai", provider: integrations.ai?.provider },
              { label: "Stripe Billing", key: "stripe", provider: "stripe" },
            ].map((item) => (
              <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: T.bg, borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: T.tx }}>{item.label}</span>
                <Pill
                  label={integrations[item.key]?.configured ? "Configured" : "Not configured"}
                  variant={integrations[item.key]?.configured ? "green" : "muted"}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.mt }}>Unable to load integration status.</div>
        )}
      </Card>

      {/* Webhook Integration */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: T.tx }}>Webhook Integration</h3>
        <div style={{ fontSize: 12, color: T.dm, marginBottom: 14 }}>
          Use these endpoints to ingest leads, payments, and events from external systems.
        </div>

        {/* Webhook URLs */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.dm, marginBottom: 8 }}>Endpoint URLs</div>
          {[
            { path: "/api/webhooks/lead", desc: "Ingest a new lead/contact" },
            { path: "/api/webhooks/payment", desc: "Ingest a payment notification" },
            { path: "/api/webhooks/event", desc: "Ingest a generic event" },
          ].map((ep) => (
            <div key={ep.path} style={{ marginBottom: 6 }}>
              <code style={{ fontSize: 12, background: T.bg, padding: "3px 8px", borderRadius: 4, color: T.bl }}>
                POST {webhookBase}{ep.path}
              </code>
              <span style={{ fontSize: 12, color: T.mt, marginLeft: 8 }}>{ep.desc}</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: T.dm, marginTop: 8 }}>
            Include <code style={{ background: T.bg, padding: "1px 4px", borderRadius: 3 }}>x-api-key: YOUR_KEY</code> header with each request.
          </div>
        </div>

        {/* API Key */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.dm, marginBottom: 8 }}>Webhook API Key</div>
          {webhookKeyLoading ? (
            <div style={{ fontSize: 13, color: T.mt }}>Loading...</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{
                flex: 1,
                fontSize: 12,
                background: T.bg,
                padding: "8px 12px",
                borderRadius: 8,
                color: webhookKey ? T.tx : T.mt,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {webhookKey
                  ? `${webhookKey.slice(0, 8)}${'•'.repeat(Math.max(0, webhookKey.length - 12))}${webhookKey.slice(-4)}`
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
            <div style={{ fontSize: 11, color: T.am, marginTop: 6 }}>
              Keep this key secret. Regenerating will invalidate the previous key.
            </div>
          )}
        </div>
      </Card>

      {/* Risk Limits */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: T.tx }}>Risk & Approval Limits</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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

      {/* Data Import */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: T.tx }}>Data Import</h3>
        <p style={{ fontSize: 12, color: T.dm, marginBottom: 12 }}>
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
          <div style={{ marginTop: 10, fontSize: 12, color: csvStatus.startsWith("Error") ? T.rd : T.gn }}>
            {csvStatus}
          </div>
        )}
      </Card>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={saveSettings} disabled={saving}>{saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}</Button>
        <Button variant="secondary" onClick={resetSetup}>Reset Onboarding</Button>
      </div>
    </div>
  );
}
