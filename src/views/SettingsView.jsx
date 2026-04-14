import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Pill from "../components/Pill.jsx";
import { friendlyError } from "../lib/errors.js";
import styles from "./SettingsView.module.css";

// ─── Integration Setup Forms ─────────────────────────────────────────────────

function IntegrationCard({ title, statusLabel, statusVariant, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Card style={{ marginBottom: "var(--space-4)" }}>
      <div className={styles.integrationCardHeader}>
        <div className={styles.integrationCardTitle}>{title}</div>
        <div className={styles.integrationCardActions}>
          <Pill label={statusLabel} variant={statusVariant} />
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Edit"}
          </Button>
        </div>
      </div>
      {open && <div className={styles.integrationFormBody}>{children}</div>}
    </Card>
  );
}

function StatusMsg({ testing, result }) {
  if (testing) return <div className={styles.testStatus} style={{ color: "var(--color-text-muted)" }}>Testing…</div>;
  if (!result) return null;
  return (
    <div
      className={styles.testStatus}
      style={{ color: result.success ? "var(--color-success)" : "var(--color-danger)" }}
    >
      {result.success ? `✓ ${result.message}` : `✗ ${result.error}`}
    </div>
  );
}

// ─── AI Provider Form ─────────────────────────────────────────────────────────

function AIProviderForm({ dbCreds, onSaved }) {
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const ANTHROPIC_MODELS = [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (claude-sonnet-4-20250514)" },
    { value: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ];
  const OPENAI_MODELS = [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ];
  const modelOptions = provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  async function handleSave() {
    if (!apiKey.trim()) { setSaveError("API key is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put(`/credentials/${provider}`, { credentials: { api_key: apiKey, model } });
      onSaved?.();
      setApiKey("");
    } catch (err) {
      setSaveError(friendlyError(err, "Could not save credentials. Please try again."));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    if (!apiKey.trim()) { setSaveError("Enter an API key to test."); return; }
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post(`/credentials/${provider}/test`, { credentials: { api_key: apiKey, model } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: friendlyError(err, "Connection test failed. Please check your credentials and try again.") });
    } finally { setTesting(false); }
  }

  const existingKey = dbCreds?.[provider]?.credentials?.api_key;
  const lastVerified = dbCreds?.[provider]?.last_verified_at;

  return (
    <div>
      <Select
        label="Provider"
        value={provider}
        onChange={(v) => { setProvider(v); setModel(v === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o"); }}
        options={[{ value: "anthropic", label: "Anthropic" }, { value: "openai", label: "OpenAI" }]}
        style={{ marginBottom: "var(--space-3)" }}
      />
      <Input
        label="API Key"
        type="password"
        value={apiKey}
        onChange={setApiKey}
        placeholder={existingKey ? `Current: ${existingKey}` : provider === "anthropic" ? "sk-ant-api…" : "sk-…"}
        style={{ marginBottom: "var(--space-3)" }}
      />
      <Select
        label="Model"
        value={model}
        onChange={setModel}
        options={modelOptions}
        style={{ marginBottom: "var(--space-4)" }}
      />
      {saveError && <div className={styles.formError}>{saveError}</div>}
      <StatusMsg testing={testing} result={testResult} />
      <div className={styles.formActions}>
        <Button size="sm" variant="secondary" onClick={handleTest} disabled={testing || saving}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || testing}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {lastVerified && (
        <div className={styles.lastVerified}>Last verified: {new Date(lastVerified).toLocaleString()}</div>
      )}
    </div>
  );
}

// ─── Email (SMTP) Form ────────────────────────────────────────────────────────

function EmailForm({ dbCreds, onSaved }) {
  const existing = dbCreds?.smtp?.credentials || {};
  const [host, setHost] = useState(existing.host || "");
  const [port, setPort] = useState(existing.port || "587");
  const [user, setUser] = useState(existing.user || "");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState(existing.from || "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState(null);

  async function handleSave() {
    if (!host.trim() || !user.trim()) { setSaveError("Host and username are required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/smtp", { credentials: { host, port, user, pass: pass || existing.pass, from } });
      onSaved?.();
      setPass("");
    } catch (err) {
      setSaveError(friendlyError(err, "Could not save credentials. Please try again."));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/smtp/test", { credentials: { host, port, user, pass: pass || existing.pass } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: friendlyError(err, "Connection test failed. Please check your credentials and try again.") });
    } finally { setTesting(false); }
  }

  return (
    <div>
      <div className={styles.formGrid}>
        <Input label="SMTP Host" value={host} onChange={setHost} placeholder="smtp.example.com" />
        <Input label="Port" type="number" value={port} onChange={setPort} placeholder="587" />
      </div>
      <div className={styles.formGrid} style={{ marginTop: "var(--space-3)" }}>
        <Input label="Username" value={user} onChange={setUser} placeholder="user@example.com" />
        <Input label="Password" type="password" value={pass} onChange={setPass} placeholder={existing.pass ? "••••••••" : "SMTP password"} />
      </div>
      <Input label="From Address" value={from} onChange={setFrom} placeholder="noreply@yourdomain.com" style={{ marginTop: "var(--space-3)" }} />
      {saveError && <div className={styles.formError}>{saveError}</div>}
      <StatusMsg testing={testing} result={testResult} />
      <div className={styles.formActions} style={{ marginTop: "var(--space-4)" }}>
        <Button size="sm" variant="secondary" onClick={handleTest} disabled={testing || saving}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || testing}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {dbCreds?.smtp?.last_verified_at && (
        <div className={styles.lastVerified}>Last verified: {new Date(dbCreds.smtp.last_verified_at).toLocaleString()}</div>
      )}
    </div>
  );
}

// ─── SMS (Twilio) Form ────────────────────────────────────────────────────────

function SMSForm({ dbCreds, onSaved }) {
  const existing = dbCreds?.twilio?.credentials || {};
  const [accountSid, setAccountSid] = useState(existing.account_sid || "");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(existing.phone_number || "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState(null);

  async function handleSave() {
    if (!accountSid.trim()) { setSaveError("Account SID is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/twilio", { credentials: { account_sid: accountSid, auth_token: authToken || existing.auth_token, phone_number: phoneNumber } });
      onSaved?.();
      setAuthToken("");
    } catch (err) {
      setSaveError(friendlyError(err, "Could not save credentials. Please try again."));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/twilio/test", { credentials: { account_sid: accountSid, auth_token: authToken || existing.auth_token } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: friendlyError(err, "Connection test failed. Please check your credentials and try again.") });
    } finally { setTesting(false); }
  }

  return (
    <div>
      <Input label="Account SID" value={accountSid} onChange={setAccountSid} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={{ marginBottom: "var(--space-3)" }} />
      <Input label="Auth Token" type="password" value={authToken} onChange={setAuthToken} placeholder={existing.auth_token ? "••••••••" : "Auth token"} style={{ marginBottom: "var(--space-3)" }} />
      <Input label="Twilio Phone Number" value={phoneNumber} onChange={setPhoneNumber} placeholder="+15550001234" style={{ marginBottom: "var(--space-4)" }} />
      {saveError && <div className={styles.formError}>{saveError}</div>}
      <StatusMsg testing={testing} result={testResult} />
      <div className={styles.formActions}>
        <Button size="sm" variant="secondary" onClick={handleTest} disabled={testing || saving}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || testing}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {dbCreds?.twilio?.last_verified_at && (
        <div className={styles.lastVerified}>Last verified: {new Date(dbCreds.twilio.last_verified_at).toLocaleString()}</div>
      )}
    </div>
  );
}

// ─── Stripe Form ──────────────────────────────────────────────────────────────

function StripeForm({ dbCreds, onSaved }) {
  const existing = dbCreds?.stripe?.credentials || {};
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState(null);

  async function handleSave() {
    if (!secretKey.trim() && !existing.secret_key) { setSaveError("Secret key is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/stripe", { credentials: { secret_key: secretKey || existing.secret_key, webhook_secret: webhookSecret || existing.webhook_secret } });
      onSaved?.();
      setSecretKey(""); setWebhookSecret("");
    } catch (err) {
      setSaveError(friendlyError(err, "Could not save credentials. Please try again."));
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/stripe/test", { credentials: { secret_key: secretKey || existing.secret_key } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: friendlyError(err, "Connection test failed. Please check your credentials and try again.") });
    } finally { setTesting(false); }
  }

  return (
    <div>
      <Input label="Secret Key" type="password" value={secretKey} onChange={setSecretKey} placeholder={existing.secret_key ? `Current: ${existing.secret_key}` : "sk_live_… or sk_test_…"} style={{ marginBottom: "var(--space-3)" }} />
      <Input label="Webhook Secret" type="password" value={webhookSecret} onChange={setWebhookSecret} placeholder={existing.webhook_secret ? "••••••••" : "whsec_…"} style={{ marginBottom: "var(--space-4)" }} />
      {saveError && <div className={styles.formError}>{saveError}</div>}
      <StatusMsg testing={testing} result={testResult} />
      <div className={styles.formActions}>
        <Button size="sm" variant="secondary" onClick={handleTest} disabled={testing || saving}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || testing}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {dbCreds?.stripe?.last_verified_at && (
        <div className={styles.lastVerified}>Last verified: {new Date(dbCreds.stripe.last_verified_at).toLocaleString()}</div>
      )}
    </div>
  );
}

// ─── Main Settings View ───────────────────────────────────────────────────────

export default function SettingsView() {
  const { workspace } = useAuth();
  const navigate = useNavigate();

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
  const [dbCreds, setDbCreds] = useState(null);

  const [webhookKey, setWebhookKey] = useState(null);
  const [webhookKeyLoading, setWebhookKeyLoading] = useState(true);
  const [webhookKeyCopied, setWebhookKeyCopied] = useState(false);
  const [webhookKeyGenerating, setWebhookKeyGenerating] = useState(false);

  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [error, setError] = useState(null);

  // Refs for scroll-to sections
  const integrationsSectionRef = useRef(null);
  const emailIntegrationRef = useRef(null);
  const csvSectionRef = useRef(null);

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

  const loadIntegrations = useCallback(() => {
    api.get('/settings/integrations')
      .then(setIntegrations)
      .catch(() => setIntegrations(null))
      .finally(() => setIntegrationsLoading(false));
  }, []);

  const loadDbCreds = useCallback(() => {
    api.get('/credentials')
      .then(setDbCreds)
      .catch(() => setDbCreds(null));
  }, []);

  useEffect(() => {
    loadIntegrations();
    loadDbCreds();

    api.get('/webhooks/key')
      .then((data) => setWebhookKey(data.key))
      .catch(() => setWebhookKey(null))
      .finally(() => setWebhookKeyLoading(false));

    api.get('/metrics/summary')
      .then(setMetrics)
      .catch(() => setMetrics(null))
      .finally(() => setMetricsLoading(false));
  }, [loadIntegrations, loadDbCreds]);

  function handleCredentialSaved() {
    loadIntegrations();
    loadDbCreds();
  }

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

  const emailConfigured = !!(integrations?.email?.configured);

  const checks = metrics
    ? [
        {
          label: "Business configured",
          done: !!metrics.businessConfigured,
          action: () => resetSetup(),
          actionLabel: "Set up",
        },
        {
          label: "Contacts added",
          done: (metrics.contactCount ?? 0) > 0,
          action: () => csvSectionRef.current?.scrollIntoView({ behavior: "smooth" }),
          actionLabel: "Import",
        },
        {
          label: "Email configured",
          done: emailConfigured,
          action: () => emailIntegrationRef.current?.scrollIntoView({ behavior: "smooth" }),
          actionLabel: "Configure",
        },
        {
          label: "Deals in pipeline",
          done: (metrics.dealCount ?? 0) > 0,
          action: () => navigate("/deals"),
          actionLabel: "Add deal",
        },
        {
          label: "First cycle completed",
          done: !!metrics.firstCycleCompleted,
          action: null,
          actionLabel: null,
        },
      ]
    : [];
  const checksDone = checks.filter((c) => c.done).length;

  const webhookBase = window.location.origin;

  // Determine integration status labels
  function integrationStatus(key) {
    const info = integrations?.[key];
    if (!info) return { label: "Not configured", variant: "muted" };
    if (info.verified) return { label: "Connected ●", variant: "green" };
    if (info.configured && info.source === "env") return { label: "Via environment", variant: "amber" };
    if (info.configured) return { label: "Configured", variant: "amber" };
    return { label: "Not configured", variant: "muted" };
  }

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
                  style={{ color: c.done ? "var(--color-text-primary)" : "var(--color-text-muted)", flex: 1 }}
                >
                  {c.label}
                </span>
                {!c.done && c.action && (
                  <button className={styles.checkAction} onClick={c.action}>{c.actionLabel}</button>
                )}
              </div>
            ))
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Unable to load checklist data.</div>
          )}
        </Card>
      </div>

      {/* Integration Setup */}
      <div className={styles.section} ref={integrationsSectionRef}>
        <h3 className={styles.sectionTitle}>Integration Setup</h3>
        {integrationsLoading ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading…</div>
        ) : (
          <>
            {/* Infrastructure Connections — collapsed by default */}
            <details className={styles.infraDetails}>
              <summary className={styles.infraSummary}>
                <span>Infrastructure Connections</span>
                <span className={styles.infraSummaryHint}>Email, SMS, Payments</span>
              </summary>
              <div className={styles.infraBody}>
                {/* Email (SMTP) */}
                <div ref={emailIntegrationRef}>
                <IntegrationCard
                  title="Email (SMTP)"
                  statusLabel={integrationStatus("email").label}
                  statusVariant={integrationStatus("email").variant}
                  defaultOpen={!emailConfigured}
                >
                  {integrations?.email?.source === "env" && (
                    <div className={styles.envNote}>✓ Configured via environment variable</div>
                  )}
                  <EmailForm dbCreds={dbCreds} onSaved={handleCredentialSaved} />
                </IntegrationCard>
                </div>

                {/* SMS (Twilio) */}
                <IntegrationCard
                  title="SMS (Twilio)"
                  statusLabel={integrationStatus("sms").label}
                  statusVariant={integrationStatus("sms").variant}
                  defaultOpen={!integrations?.sms?.configured}
                >
                  {integrations?.sms?.source === "env" && (
                    <div className={styles.envNote}>✓ Configured via environment variable</div>
                  )}
                  <SMSForm dbCreds={dbCreds} onSaved={handleCredentialSaved} />
                </IntegrationCard>

                {/* Stripe */}
                <IntegrationCard
                  title="Stripe Billing"
                  statusLabel={integrationStatus("stripe").label}
                  statusVariant={integrationStatus("stripe").variant}
                  defaultOpen={!integrations?.stripe?.configured}
                >
                  {integrations?.stripe?.source === "env" && (
                    <div className={styles.envNote}>✓ Configured via environment variable</div>
                  )}
                  <StripeForm dbCreds={dbCreds} onSaved={handleCredentialSaved} />
                </IntegrationCard>
              </div>
            </details>

            {/* Advanced / Enterprise — AI Provider (collapsed by default) */}
            <details className={styles.infraDetails} style={{ marginTop: "var(--space-4)" }}>
              <summary className={styles.infraSummary}>
                <span>Advanced / Enterprise</span>
                <span className={styles.infraSummaryHint}>Custom AI Provider</span>
              </summary>
              <div className={styles.infraBody}>
                <Card style={{ marginBottom: 0 }}>
                  <div className={styles.integrationCardHeader}>
                    <div className={styles.integrationCardTitle}>AI Provider</div>
                    <div className={styles.integrationCardActions}>
                      <Pill
                        label={integrationStatus("ai").label}
                        variant={integrationStatus("ai").variant}
                      />
                    </div>
                  </div>
                  <div className={styles.integrationFormBody}>
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
                      Your AI team is powered by the platform by default. Add your own API key here only if you want a separate billing account or custom model.
                    </p>
                    {integrations?.ai?.source === "env" && (
                      <div className={styles.envNote}>✓ Configured via environment variable</div>
                    )}
                    <AIProviderForm dbCreds={dbCreds} onSaved={handleCredentialSaved} />
                  </div>
                </Card>
              </div>
            </details>
          </>
        )}
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
      <div className={styles.section} ref={csvSectionRef}>
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

