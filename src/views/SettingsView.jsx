import { useState } from "react";
import { T } from "../lib/theme.js";
import { iso } from "../lib/utils.js";
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
            <span style={{ fontSize: 16 }}>{c.done ? "✅" : "⬜"}</span>
            <span style={{ fontSize: 13, color: c.done ? T.tx : T.mt, textDecoration: c.done ? "none" : "none" }}>
              {c.label}
            </span>
          </div>
        ))}
      </Card>

      {/* Integration Keys */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: T.tx }}>Integration Keys</h3>
        {KEY_CONFIGS.map((cfg) => (
          <div key={cfg.key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.dm }}>{cfg.label}</label>
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
            ⚠️ Add your Anthropic LLM key to enable AI-powered features (Process View, AI query, smart extraction).
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

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={saveSettings}>{saved ? "✓ Saved!" : "Save Settings"}</Button>
        <Button variant="secondary" onClick={resetSetup}>Reset Onboarding</Button>
      </div>
    </div>
  );
}
