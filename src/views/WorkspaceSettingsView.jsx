import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Pill from "../components/Pill.jsx";
import styles from "./WorkspaceSettingsView.module.css";

// ─── AI Provider Form ─────────────────────────────────────────────────────────

function friendlyError(err, fallback) {
  const msg = err?.message || '';
  if (/invalid|unauthorized|required|forbidden|not found|timeout|network|rate limit|credential|connection/i.test(msg)) {
    return msg;
  }
  return fallback;
}

function StatusMsg({ testing, result }) {
  if (testing) return <div className={styles.testStatus} style={{ color: "var(--color-text-muted)" }}>Testing…</div>;
  if (!result) return null;
  return (
    <div className={styles.testStatus} style={{ color: result.success ? "var(--color-success)" : "var(--color-danger)" }}>
      {result.success ? `✓ ${result.message}` : `✗ ${result.error}`}
    </div>
  );
}

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
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
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

// ─── Main View ────────────────────────────────────────────────────────────────

export default function WorkspaceSettingsView() {
  const { workspace } = useAuth();

  const [csvStatus, setCsvStatus] = useState(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const csvInputRef = useRef(null);

  const [dbCreds, setDbCreds] = useState(null);
  const [integrations, setIntegrations] = useState(null);

  const [webhookKey, setWebhookKey] = useState(null);
  const [webhookKeyLoading, setWebhookKeyLoading] = useState(true);
  const [webhookKeyCopied, setWebhookKeyCopied] = useState(false);
  const [webhookKeyGenerating, setWebhookKeyGenerating] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(() => {
    api.get("/credentials").then(setDbCreds).catch(() => setDbCreds(null));
    api.get("/settings/integrations").then(setIntegrations).catch(() => setIntegrations(null));
    api.get("/webhooks/key")
      .then((d) => setWebhookKey(d.key))
      .catch(() => setWebhookKey(null))
      .finally(() => setWebhookKeyLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function generateWebhookKey() {
    setWebhookKeyGenerating(true);
    try {
      const data = await api.post("/webhooks/generate-key", {});
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
            await api.post("/contacts", { name, email: email || null, phone: phone || null, type: "lead" });
            imported++;
          } catch { failed++; }
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

  async function resetSetup() {
    if (!workspace) return;
    if (!window.confirm("Reset onboarding? Your data will be preserved.")) return;
    try {
      await api.patch(`/workspaces/${workspace.id}`, {
        settings: { ...workspace.settings, setupCompleted: false },
      });
      window.location.reload();
    } catch (err) {
      setError(err.message || "Failed to reset onboarding.");
    }
  }

  const aiStatus = integrations?.ai;
  const webhookBase = window.location.origin;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Workspace Settings</h2>
          <div className={styles.pageSubtitle}>Manage your workspace, team, and preferences.</div>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Section 1: Business Profile */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Business Profile</h3>
        <Card>
          <div className={styles.profileGrid}>
            <div className={styles.profileField}>
              <div className={styles.profileLabel}>Business name</div>
              <div className={styles.profileValue}>{workspace?.name || "—"}</div>
            </div>
            <div className={styles.profileField}>
              <div className={styles.profileLabel}>Industry</div>
              <div className={styles.profileValue}>{workspace?.industry || "—"}</div>
            </div>
            {workspace?.teamSize && (
              <div className={styles.profileField}>
                <div className={styles.profileLabel}>Team size</div>
                <div className={styles.profileValue}>{workspace.teamSize}</div>
              </div>
            )}
            {workspace?.serviceArea && (
              <div className={styles.profileField}>
                <div className={styles.profileLabel}>Service area</div>
                <div className={styles.profileValue}>{workspace.serviceArea}</div>
              </div>
            )}
          </div>
          <div className={styles.profileActions}>
            <Button variant="secondary" size="sm" onClick={resetSetup}>
              Edit Profile
            </Button>
          </div>
        </Card>
      </div>

      {/* Section 2: Data Import */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Data Import</h3>
        <Card>
          <p className={styles.sectionDesc}>
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
            {csvImporting ? "Importing…" : "Import contacts from CSV"}
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

      {/* Section 3: Onboarding */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Onboarding</h3>
        <Card>
          <p className={styles.sectionDesc}>
            Re-run the setup wizard to update your business profile and initial configuration. Your data will be preserved.
          </p>
          <div className={styles.onboardingRow}>
            <Pill
              label={workspace?.settings?.setupCompleted ? "Setup complete" : "Setup incomplete"}
              variant={workspace?.settings?.setupCompleted ? "green" : "amber"}
            />
            <Button variant="secondary" size="sm" onClick={resetSetup}>
              Re-run setup wizard
            </Button>
          </div>
        </Card>
      </div>

      {/* Section 4: Advanced / Admin (collapsed by default) */}
      <div className={styles.section}>
        <button
          type="button"
          className={styles.expandHeader}
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          <h3 className={styles.sectionTitle} style={{ margin: 0 }}>Advanced / Admin</h3>
          <span className={styles.expandIcon}>{advancedOpen ? "▲" : "▼"}</span>
        </button>

        {advancedOpen && (
          <div className={styles.advancedBody}>

            {/* AI Provider */}
            <Card style={{ marginBottom: "var(--space-4)" }}>
              <div className={styles.subsectionHeader}>
                <div className={styles.subsectionTitle}>AI Provider</div>
                {aiStatus && (
                  <Pill
                    label={aiStatus.verified ? "Connected ✓" : aiStatus.configured ? "Connected ✓" : "Not connected"}
                    variant={aiStatus.configured ? "green" : "muted"}
                  />
                )}
              </div>
              <div className={styles.subsectionDesc}>
                Configure which AI provider powers your agent team.
              </div>
              <AIProviderForm dbCreds={dbCreds} onSaved={loadData} />
            </Card>

            {/* Webhook Integration */}
            <Card>
              <div className={styles.subsectionTitle} style={{ marginBottom: "var(--space-3)" }}>
                Webhook Integration
              </div>
              <div className={styles.subsectionDesc}>
                Use these endpoints to ingest leads, payments, and events from external systems.
              </div>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <div className={styles.webhookLabel}>Endpoint URLs</div>
                {[
                  { path: "/api/webhooks/lead", desc: "Ingest a new lead" },
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
                <div className={styles.webhookLabel}>Webhook API Key</div>
                {webhookKeyLoading ? (
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Loading...</div>
                ) : (
                  <div className={styles.webhookKeyRow}>
                    <code className={styles.webhookKeyDisplay} style={{ color: webhookKey ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
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
                      {webhookKeyGenerating ? "…" : webhookKey ? "Regenerate" : "Generate Key"}
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
        )}
      </div>
    </div>
  );
}
