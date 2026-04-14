import { useState, useCallback, useEffect } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Pill from "../components/Pill.jsx";
import styles from "./ConnectionsView.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function connectionStatus(integrations, key, dbCreds) {
  const info = integrations?.[key];
  if (!info) return { label: "Not connected", variant: "muted", connected: false };
  if (info.verified) return { label: "Connected ✓", variant: "green", connected: true };
  // If source is env or configured via DB, show Connected (don't expose "env var")
  if (info.configured) return { label: "Connected ✓", variant: "green", connected: true };
  if (dbCreds?.[key]?.credentials) return { label: "Connected ✓", variant: "green", connected: true };
  return { label: "Not connected", variant: "muted", connected: false };
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSave() {
    if (!host.trim() || !user.trim()) { setSaveError("Email server and address are required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/smtp", { credentials: { host, port, user, pass: pass || existing.pass, from } });
      onSaved?.();
      setPass("");
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/smtp/test", { credentials: { host, port, user, pass: pass || existing.pass } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message || "Test failed." });
    } finally { setTesting(false); }
  }

  return (
    <div className={styles.formBody}>
      <p className={styles.formHint}>Enter your email credentials below. Use the Advanced settings to configure SMTP directly.</p>
      <Input label="Email address" value={user} onChange={setUser} placeholder="you@yourdomain.com" />
      <Input label="Password" type="password" value={pass} onChange={setPass} placeholder={existing.pass ? "••••••••" : "Email password"} />
      <button
        type="button"
        className={styles.advancedToggle}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "▲ Hide advanced settings" : "▼ Show advanced settings"}
      </button>
      {showAdvanced && (
        <div className={styles.advancedSection}>
          <p className={styles.advancedNote}>SMTP · Gmail · Outlook</p>
          <div className={styles.formGrid}>
            <Input label="Email server" value={host} onChange={setHost} placeholder="smtp.example.com" />
            <Input label="Port" type="number" value={port} onChange={setPort} placeholder="587" />
          </div>
          <Input label="Send-from address" value={from} onChange={setFrom} placeholder="noreply@yourdomain.com" style={{ marginTop: "var(--space-3)" }} />
        </div>
      )}
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
      {dbCreds?.smtp?.last_verified_at && (
        <div className={styles.lastVerified}>Last verified: {new Date(dbCreds.smtp.last_verified_at).toLocaleString()}</div>
      )}
    </div>
  );
}

// ─── SMS (Twilio) Form ────────────────────────────────────────────────────────

function SMSForm({ dbCreds, onSaved }) {
  const existing = dbCreds?.twilio?.credentials || {};
  const [accountId, setAccountId] = useState(existing.account_sid || "");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(existing.phone_number || "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSave() {
    if (!accountId.trim()) { setSaveError("Twilio Account ID is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/twilio", { credentials: { account_sid: accountId, auth_token: authToken || existing.auth_token, phone_number: phoneNumber } });
      onSaved?.();
      setAuthToken("");
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/twilio/test", { credentials: { account_sid: accountId, auth_token: authToken || existing.auth_token } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message || "Test failed." });
    } finally { setTesting(false); }
  }

  return (
    <div className={styles.formBody}>
      <Input label="Phone Number" value={phoneNumber} onChange={setPhoneNumber} placeholder="+15550001234" />
      <button
        type="button"
        className={styles.advancedToggle}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "▲ Hide advanced settings" : "▼ Show advanced settings"}
      </button>
      {showAdvanced && (
        <div className={styles.advancedSection}>
          <p className={styles.advancedNote}>Twilio · OpenPhone (coming soon) · RingCentral (coming soon)</p>
          <p className={styles.formHint}>Find these in your Twilio dashboard at twilio.com/console.</p>
          <Input label="Twilio Account ID" value={accountId} onChange={setAccountId} placeholder="Your Twilio Account ID" style={{ marginBottom: "var(--space-3)" }} />
          <Input label="Auth Token" type="password" value={authToken} onChange={setAuthToken} placeholder={existing.auth_token ? "••••••••" : "Auth token"} style={{ marginBottom: "var(--space-3)" }} />
        </div>
      )}
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

// ─── AI Provider Form ─────────────────────────────────────────────────────────

function AIProviderForm({ dbCreds, onSaved }) {
  const existing = dbCreds?.anthropic?.credentials || {};
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState(null);

  async function handleSave() {
    if (!apiKey.trim() && !existing.api_key) { setSaveError("API key is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/anthropic", { credentials: { api_key: apiKey || existing.api_key } });
      onSaved?.();
      setApiKey("");
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally { setSaving(false); }
  }

  async function handleTest() {
    if (!apiKey.trim() && !existing.api_key) { setSaveError("Enter an API key to test."); return; }
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/anthropic/test", { credentials: { api_key: apiKey || existing.api_key } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message || "Test failed." });
    } finally { setTesting(false); }
  }

  return (
    <div className={styles.formBody}>
      <p className={styles.formHint}>Your AI team is powered by the platform by default. Add your own API key here if you want to use a separate billing account or a different model.</p>
      <Input
        label="Anthropic API Key (optional override)"
        type="password"
        value={apiKey}
        onChange={setApiKey}
        placeholder={existing.api_key ? "Current key configured" : "sk-ant-api…"}
        style={{ marginBottom: "var(--space-3)" }}
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
      {dbCreds?.anthropic?.last_verified_at && (
        <div className={styles.lastVerified}>Last verified: {new Date(dbCreds.anthropic.last_verified_at).toLocaleString()}</div>
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSave() {
    if (!secretKey.trim() && !existing.secret_key) { setSaveError("Stripe API Key is required."); return; }
    setSaving(true); setSaveError(null);
    try {
      await api.put("/credentials/stripe", { credentials: { secret_key: secretKey || existing.secret_key, webhook_secret: webhookSecret || existing.webhook_secret } });
      onSaved?.();
      setSecretKey(""); setWebhookSecret("");
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null); setSaveError(null);
    try {
      const result = await api.post("/credentials/stripe/test", { credentials: { secret_key: secretKey || existing.secret_key } });
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message || "Test failed." });
    } finally { setTesting(false); }
  }

  return (
    <div className={styles.formBody}>
      <p className={styles.formHint}>Find your API key at <strong>dashboard.stripe.com/apikeys</strong>.</p>
      <Input label="Stripe API Key" type="password" value={secretKey} onChange={setSecretKey} placeholder={existing.secret_key ? `Current: ${existing.secret_key}` : "sk_live_… or sk_test_…"} style={{ marginBottom: "var(--space-3)" }} />
      <button
        type="button"
        className={styles.advancedToggle}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "▲ Hide advanced settings" : "▼ Show advanced settings"}
      </button>
      {showAdvanced && (
        <div className={styles.advancedSection}>
          <p className={styles.advancedNote}>Stripe · QuickBooks (coming soon)</p>
          <Input label="Stripe Webhook Secret (optional)" type="password" value={webhookSecret} onChange={setWebhookSecret} placeholder={existing.webhook_secret ? "••••••••" : "whsec_…"} style={{ marginBottom: "var(--space-4)" }} />
        </div>
      )}
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

// ─── Connection Card ──────────────────────────────────────────────────────────

function ConnectionCard({ title, description, statusLabel, statusVariant, connected, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <Card className={styles.connCard}>
      <div className={styles.connCardHeader}>
        <div className={styles.connCardLeft}>
          <div className={styles.connCardTitle}>{title}</div>
          <div className={styles.connCardDesc}>{description}</div>
        </div>
        <div className={styles.connCardRight}>
          <Pill label={statusLabel} variant={statusVariant} />
          <Button
            size="sm"
            variant={connected ? "secondary" : "primary"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide" : connected ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </div>
      {open && <div className={styles.connCardBody}>{children}</div>}
    </Card>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ConnectionsView() {
  const { workspace } = useAuth();
  const [integrations, setIntegrations] = useState(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [dbCreds, setDbCreds] = useState(null);
  const [csvStatus, setCsvStatus] = useState(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const loadData = useCallback(() => {
    Promise.all([
      api.get("/settings/integrations").catch(() => null),
      api.get("/credentials").catch(() => null),
    ]).then(([intData, credsData]) => {
      setIntegrations(intData);
      setDbCreds(credsData);
    }).finally(() => setIntegrationsLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleSaved() {
    loadData();
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
            await api.post("/contacts", { name, email: email || null, phone: phone || null, type: "lead" });
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

  const aiConnected = !!(dbCreds?.anthropic?.credentials || integrations?.ai?.configured);
  const emailStatus = connectionStatus(integrations, "email", dbCreds);
  const smsStatus = connectionStatus(integrations, "sms", dbCreds);
  const stripeStatus = connectionStatus(integrations, "stripe", dbCreds);

  const leadIntakeUrl = `${window.location.origin}/api/webhooks/lead`;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Business Connections</h2>
          <div className={styles.pageSubtitle}>Connect your business systems so your AI team can operate.</div>
        </div>
      </div>

      {integrationsLoading ? (
        <div className={styles.loadingGrid}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className={styles.loadingCard} />)}
        </div>
      ) : (
        <div className={styles.cardGrid}>

          {/* AI Intelligence — highest priority, powers the core differentiator */}
          <ConnectionCard
            title="AI Intelligence"
            description="Powers advanced analysis, synthesis, and proactive recommendations across all 5 agents"
            statusLabel={aiConnected ? "Connected ✓" : "Not connected"}
            statusVariant={aiConnected ? "green" : "muted"}
            connected={aiConnected}
            defaultOpen={!aiConnected}
          >
            <AIProviderForm dbCreds={dbCreds} onSaved={handleSaved} />
          </ConnectionCard>

          {/* Email */}
          <ConnectionCard
            title="Email"
            description="Customer communication, invoice reminders, support handling"
            statusLabel={emailStatus.label}
            statusVariant={emailStatus.variant}
            connected={emailStatus.connected}
            defaultOpen={!emailStatus.connected}
          >
            <EmailForm dbCreds={dbCreds} onSaved={handleSaved} />
          </ConnectionCard>

          {/* Phone / Text */}
          <ConnectionCard
            title="Phone / Text"
            description="SMS follow-up, urgent communication, missed call handling"
            statusLabel={smsStatus.label}
            statusVariant={smsStatus.variant}
            connected={smsStatus.connected}
            defaultOpen={!smsStatus.connected}
          >
            <SMSForm dbCreds={dbCreds} onSaved={handleSaved} />
          </ConnectionCard>

          {/* Invoices / Payments */}
          <ConnectionCard
            title="Invoices / Payments"
            description="Invoice tracking, payment events, collections"
            statusLabel={stripeStatus.label}
            statusVariant={stripeStatus.variant}
            connected={stripeStatus.connected}
            defaultOpen={!stripeStatus.connected}
          >
            <StripeForm dbCreds={dbCreds} onSaved={handleSaved} />
          </ConnectionCard>

          {/* Calendar */}
          <ConnectionCard
            title="Calendar / Scheduling"
            description="Appointments, dispatching, follow-up timing"
            statusLabel="Not connected"
            statusVariant="muted"
            connected={false}
          >
            <div className={styles.comingSoon}>
              <div className={styles.comingSoonIcon}>—</div>
              <div className={styles.comingSoonText}>Calendar integrations are coming soon.</div>
              <div className={styles.comingSoonDesc}>Google Calendar, Calendly, and Outlook will be supported.</div>
            </div>
          </ConnectionCard>

          {/* Leads / CRM */}
          <ConnectionCard
            title="Leads / CRM"
            description="Lead intake, routing, qualification"
            statusLabel="Connected ✓"
            statusVariant="green"
            connected={true}
          >
            <div className={styles.providerNote}>Website forms · CSV import · HubSpot (coming soon)</div>

            <div className={styles.subSection}>
              <div className={styles.subSectionTitle}>Your lead intake URL</div>
              <div className={styles.urlRow}>
                <code className={styles.urlCode}>{leadIntakeUrl}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(leadIntakeUrl);
                  }}
                >
                  Copy
                </Button>
              </div>
              <div className={styles.urlHint}>
                POST to this URL from your website forms to send leads directly to your Growth agent.
              </div>
            </div>

            <div className={styles.subSection}>
              <div className={styles.subSectionTitle}>Import contacts from CSV</div>
              <p className={styles.subSectionDesc}>
                Import contacts from a CSV or TSV file. Include: name, email, phone columns.
              </p>
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                id="csv-import-connections"
                onChange={handleCsvImport}
                style={{ display: "none" }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => document.getElementById("csv-import-connections")?.click()}
                disabled={csvImporting}
              >
                {csvImporting ? "Importing…" : "Import CSV / TSV"}
              </Button>
              {csvStatus && (
                <div
                  className={styles.csvStatus}
                  style={{ color: csvStatus.startsWith("Error") ? "var(--color-danger)" : "var(--color-success)" }}
                >
                  {csvStatus}
                </div>
              )}
            </div>

          </ConnectionCard>

        </div>
      )}

      {workspace?.name && (
        <div className={styles.workspaceNote}>
          Connected workspace: <strong>{workspace.name}</strong>
        </div>
      )}
    </div>
  );
}
