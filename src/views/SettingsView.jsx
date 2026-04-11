import { useState, useRef } from "react";
import { T } from "../lib/theme.js";
import { uid, iso } from "../lib/utils.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Section from "../components/Section.jsx";
import Pill from "../components/Pill.jsx";

export default function SettingsView({ db, onUpdate }) {
  const [keys, setKeys] = useState({
    stripe: db.cfg.keys?.stripe || "",
    gmail: db.cfg.keys?.gmail || "",
    twilio: db.cfg.keys?.twilio || "",
    llm: db.cfg.keys?.llm || "",
  });
  const [limits, setLimits] = useState({
    maxAutoSpend: db.cfg.riskLimits?.maxAutoSpend || 500,
    refundThreshold: db.cfg.riskLimits?.refundThreshold || 100,
    approvalAbove: db.cfg.riskLimits?.approvalAbove || 5000,
    dailyEmailLimit: db.cfg.riskLimits?.dailyEmailLimit || 50,
  });
  const [saved, setSaved] = useState(false);
  const [csvStatus, setCsvStatus] = useState(null);
  const csvInputRef = useRef(null);

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

  function handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSVText(ev.target.result);
        if (rows.length === 0) { setCsvStatus("No data rows found."); return; }

        const updated = JSON.parse(JSON.stringify(db));
        let imported = 0;

        rows.forEach((row) => {
          // Detect contact row
          const name = row.name || row.fullname || row.contactname || row.company;
          const email = row.email || row.emailaddress;
          const phone = row.phone || row.phonenumber || row.mobile;
          if (name) {
            const exists = (updated.contacts || []).some((c) => {
              if (email && c.email) return c.email === email;
              if (phone && c.phone) return c.phone === phone;
              return c.name === name;
            });
            if (!exists) {
              updated.contacts = [...(updated.contacts || []), {
                id: uid(), name, email: email || null,
                phone: phone || null,
                type: "lead", createdAt: iso(), tags: [],
              }];
              imported++;
            }
          }
        });

        updated.audit = [...(updated.audit || []), {
          id: uid(), at: iso(), agent: "Settings", action: "csv_import",
          desc: `CSV import: ${imported} records imported from ${file.name}`, auto: false,
        }];

        onUpdate(updated);
        setCsvStatus(`✓ Imported ${imported} contacts from ${file.name}`);
      } catch (err) {
        setCsvStatus(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported if needed
    e.target.value = "";
  }

  function saveSettings() {
    const updated = JSON.parse(JSON.stringify(db));
    updated.cfg.keys = {
      stripe: keys.stripe || null,
      gmail: keys.gmail || null,
      twilio: keys.twilio || null,
      llm: keys.llm || null,
    };
    updated.cfg.riskLimits = {
      maxAutoSpend: Number(limits.maxAutoSpend),
      refundThreshold: Number(limits.refundThreshold),
      approvalAbove: Number(limits.approvalAbove),
      dailyEmailLimit: Number(limits.dailyEmailLimit),
    };
    onUpdate(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function resetSetup() {
    if (window.confirm("Reset onboarding? Your data will be preserved.")) {
      const updated = JSON.parse(JSON.stringify(db));
      updated.cfg.ok = false;
      onUpdate(updated);
    }
  }

  // Activation checklist
  const checks = [
    { label: "Business configured", done: !!db.cfg.name && !!db.cfg.type },
    { label: "Contacts added", done: (db.contacts || []).length > 0 },
    { label: "Transactions added", done: (db.txns || []).length > 0 },
    { label: "Deals in pipeline", done: (db.deals || []).length > 0 },
    { label: "LLM key configured", done: !!db.cfg.keys?.llm },
    { label: "First cycle completed", done: !!db.cfg.lastCycle },
  ];
  const checksDone = checks.filter((c) => c.done).length;

  const KEY_CONFIGS = [
    { key: "llm", label: "Anthropic LLM Key", placeholder: "sk-ant-..." },
    { key: "gmail", label: "Gmail / Email Key", placeholder: "ya29..." },
    { key: "twilio", label: "Twilio API Key", placeholder: "SK..." },
    { key: "stripe", label: "Stripe Secret Key", placeholder: "sk_live_..." },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Settings</h2>
        <div style={{ fontSize: 13, color: T.dm }}>Configure integrations, risk limits, and platform preferences.</div>
      </div>

      {/* Activation Checklist */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.tx }}>Activation Checklist</h3>
          <span style={{ fontSize: 13, fontWeight: 600, color: checksDone === checks.length ? T.gn : T.am }}>
            {checksDone}/{checks.length} complete
          </span>
        </div>
        {checks.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.done ? T.gn : T.mt }}>{c.done ? "[x]" : "[ ]"}</span>
            <span style={{ fontSize: 13, color: c.done ? T.tx : T.mt, textDecoration: c.done ? "none" : "none" }}>
              {c.label}
            </span>
          </div>
        ))}
      </Card>

      {/* Integration Keys */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: T.tx }}>Integration Keys</h3>
        <div style={{ background: T.rdL, border: `1px solid ${T.rd}30`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: T.rd, marginBottom: 16 }}>
          [DEV MODE] API keys are stored in your browser and sent directly from the client. In production, keys should be proxied through a backend server. Do not use production API keys here.
        </div>
        {KEY_CONFIGS.map((cfg) => (
          <div key={cfg.key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.dm }}>
                {cfg.label}{" "}
                <span style={{ background: T.am, color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>DEV</span>
              </label>
              <Pill
                label={keys[cfg.key] ? "Connected" : "Not configured"}
                variant={keys[cfg.key] ? "green" : "muted"}
              />
            </div>
            <input
              type="password"
              value={keys[cfg.key]}
              onChange={(e) => setKeys((k) => ({ ...k, [cfg.key]: e.target.value }))}
              placeholder={cfg.placeholder}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: `1px solid ${T.bd}`,
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: T.tx,
                background: T.wh,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
        {!db.cfg.keys?.llm && (
          <div style={{ background: T.amL, border: `1px solid ${T.am}30`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: T.am, marginTop: 8 }}>
            WARNING: Add your Anthropic LLM key to enable AI-powered features (Process View, AI query, smart extraction).
          </div>
        )}
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
        <Button variant="secondary" onClick={() => csvInputRef.current?.click()}>
          Import CSV / TSV
        </Button>
        {csvStatus && (
          <div style={{ marginTop: 10, fontSize: 12, color: csvStatus.startsWith("✓") ? T.gn : T.rd }}>
            {csvStatus}
          </div>
        )}
      </Card>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={saveSettings}>{saved ? "✓ Saved!" : "Save Settings"}</Button>
        <Button variant="secondary" onClick={resetSetup}>Reset Onboarding</Button>
      </div>
    </div>
  );
}
