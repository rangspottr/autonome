import { useState } from "react";
import { T } from "../lib/theme.js";
import { uid, iso } from "../lib/utils.js";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";

const INDUSTRY_DEFAULTS = {
  roofing: { type: "roofing", riskLimits: { maxAutoSpend: 1000, approvalAbove: 10000 } },
  hvac: { type: "hvac", riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 } },
  plumbing: { type: "plumbing", riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 } },
  solar: { type: "solar", riskLimits: { maxAutoSpend: 2000, approvalAbove: 20000 } },
  construction: { type: "construction", riskLimits: { maxAutoSpend: 2000, approvalAbove: 25000 } },
  agency: { type: "agency", riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 } },
  ecommerce: { type: "ecommerce", riskLimits: { maxAutoSpend: 300, approvalAbove: 3000 } },
  saas: { type: "saas", riskLimits: { maxAutoSpend: 1000, approvalAbove: 10000 } },
  services: { type: "services", riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 } },
  other: { type: "other", riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 } },
};

const STEPS = [
  "Business Identity",
  "Service Model",
  "Revenue Model",
  "Comm Preferences",
  "Approval Thresholds",
  "Data Import",
];

export default function Setup({ db, onSave }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: db.cfg.name || "",
    type: db.cfg.type || "services",
    autoExec: db.cfg.autoExec !== false,
    dailyEmailLimit: db.cfg.riskLimits?.dailyEmailLimit || 50,
    maxAutoSpend: db.cfg.riskLimits?.maxAutoSpend || 500,
    refundThreshold: db.cfg.riskLimits?.refundThreshold || 100,
    approvalAbove: db.cfg.riskLimits?.approvalAbove || 5000,
    stripeKey: db.cfg.keys?.stripe || "",
    gmailKey: db.cfg.keys?.gmail || "",
    twilioKey: db.cfg.keys?.twilio || "",
    llmKey: db.cfg.keys?.llm || "",
    importText: "",
  });

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  function applyIndustryDefaults(industry) {
    const defaults = INDUSTRY_DEFAULTS[industry];
    if (!defaults) return;
    setForm((f) => ({
      ...f,
      type: industry,
      maxAutoSpend: defaults.riskLimits.maxAutoSpend,
      approvalAbove: defaults.riskLimits.approvalAbove,
    }));
  }

  function finish() {
    const updated = JSON.parse(JSON.stringify(db));
    updated.cfg.name = form.name;
    updated.cfg.type = form.type;
    updated.cfg.ok = true;
    updated.cfg.at = iso();
    updated.cfg.autoExec = form.autoExec;
    updated.cfg.riskLimits = {
      maxAutoSpend: Number(form.maxAutoSpend),
      refundThreshold: Number(form.refundThreshold),
      approvalAbove: Number(form.approvalAbove),
      dailyEmailLimit: Number(form.dailyEmailLimit),
    };
    updated.cfg.keys = {
      stripe: form.stripeKey || null,
      gmail: form.gmailKey || null,
      twilio: form.twilioKey || null,
      llm: form.llmKey || null,
    };
    onSave(updated);
  }

  const stepContent = [
    // Step 0: Business Identity
    <div key="s0">
      <p style={{ color: T.dm, fontSize: 13, marginBottom: 20 }}>
        Tell Autonome about your business so it can personalize your experience.
      </p>
      <Input label="Business Name" value={form.name} onChange={set("name")} placeholder="e.g. ABC Roofing LLC" />
      <Select
        label="Industry"
        value={form.type}
        onChange={(v) => applyIndustryDefaults(v)}
        options={Object.keys(INDUSTRY_DEFAULTS).map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))}
      />
    </div>,

    // Step 1: Service Model
    <div key="s1">
      <p style={{ color: T.dm, fontSize: 13, marginBottom: 20 }}>
        How does your business deliver value?
      </p>
      <Select
        label="Service Model"
        value={form.type}
        onChange={set("type")}
        options={[
          { value: "project", label: "Project-based (one-time jobs)" },
          { value: "recurring", label: "Recurring service contracts" },
          { value: "product", label: "Product / E-commerce" },
          { value: "subscription", label: "Subscription / SaaS" },
          { value: "consulting", label: "Consulting / Professional Services" },
        ]}
      />
    </div>,

    // Step 2: Revenue Model
    <div key="s2">
      <p style={{ color: T.dm, fontSize: 13, marginBottom: 20 }}>
        Set your revenue model parameters.
      </p>
      <Input label="Typical Deal Size ($)" type="number" value={String(form.approvalAbove / 2)} onChange={(v) => set("approvalAbove")(String(Number(v) * 2))} placeholder="5000" />
      <div style={{ display: "flex", gap: 8 }}>
        <Input label="Max Auto-Spend ($)" type="number" value={String(form.maxAutoSpend)} onChange={set("maxAutoSpend")} placeholder="500" style={{ flex: 1 }} />
        <Input label="Approval Threshold ($)" type="number" value={String(form.approvalAbove)} onChange={set("approvalAbove")} placeholder="5000" style={{ flex: 1 }} />
      </div>
    </div>,

    // Step 3: Comm Preferences
    <div key="s3">
      <p style={{ color: T.dm, fontSize: 13, marginBottom: 20 }}>
        Communication settings.
      </p>
      <Input label="Daily Email Limit" type="number" value={String(form.dailyEmailLimit)} onChange={set("dailyEmailLimit")} placeholder="50" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <input type="checkbox" id="autoExec" checked={form.autoExec} onChange={(e) => set("autoExec")(e.target.checked)} />
        <label htmlFor="autoExec" style={{ fontSize: 13, color: T.tx }}>
          Enable autonomous execution (auto-execute safe actions)
        </label>
      </div>
    </div>,

    // Step 4: Approval Thresholds
    <div key="s4">
      <p style={{ color: T.dm, fontSize: 13, marginBottom: 20 }}>
        Configure when Autonome should ask for your approval.
      </p>
      <Input label="Max Auto-Spend ($)" type="number" value={String(form.maxAutoSpend)} onChange={set("maxAutoSpend")} placeholder="500" />
      <Input label="Refund Threshold ($)" type="number" value={String(form.refundThreshold)} onChange={set("refundThreshold")} placeholder="100" />
      <Input label="Approval Required Above ($)" type="number" value={String(form.approvalAbove)} onChange={set("approvalAbove")} placeholder="5000" />
    </div>,

    // Step 5: Data Import
    <div key="s5">
      <p style={{ color: T.dm, fontSize: 13, marginBottom: 20 }}>
        Optionally paste existing customer or deal data to import.
      </p>
      <textarea
        value={form.importText}
        onChange={(e) => setForm((f) => ({ ...f, importText: e.target.value }))}
        placeholder="Paste customer names, emails, deal information..."
        style={{
          width: "100%",
          height: 120,
          padding: "8px 12px",
          border: `1px solid ${T.bd}`,
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <p style={{ fontSize: 12, color: T.mt }}>
        Autonome will parse this text and extract contacts, deals, and tasks.
      </p>
    </div>,
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: T.bg,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520, padding: 32 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.tx, marginBottom: 4 }}>⚡ Autonome</div>
          <div style={{ fontSize: 13, color: T.dm }}>Your AI Business Operator</div>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= step ? T.bl : T.bd,
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>

        {/* Card */}
        <div
          style={{
            background: T.wh,
            border: `1px solid ${T.bd}`,
            borderRadius: 16,
            padding: 28,
          }}
        >
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>
            {STEPS[step]}
          </h2>
          <div style={{ fontSize: 12, color: T.mt, marginBottom: 20 }}>
            Step {step + 1} of {STEPS.length}
          </div>

          {stepContent[step]}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 8 }}>
            <Button
              variant="secondary"
              onClick={() => (step > 0 ? setStep(step - 1) : null)}
              disabled={step === 0}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 0 && !form.name}
              >
                Continue →
              </Button>
            ) : (
              <Button onClick={finish} disabled={!form.name}>
                Complete Setup ✓
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
