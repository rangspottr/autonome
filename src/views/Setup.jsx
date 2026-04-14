import { useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import AgentMeta from "../components/AgentMeta.js";
import styles from "./Setup.module.css";

const INDUSTRY_DEFAULTS = {
  roofing: {
    type: "roofing",
    riskLimits: { maxAutoSpend: 1000, approvalAbove: 10000 },
    seedContacts: [
      { name: "Johnson Residence", type: "customer", phone: "555-0101", tags: ["homeowner"] },
      { name: "Martinez Property", type: "lead", phone: "555-0102", tags: ["homeowner"] },
      { name: "Williams Home", type: "lead", phone: "555-0103", tags: ["homeowner"] },
    ],
    seedDeals: [
      { desc: "Roof replacement estimate", val: 12000, stage: "proposal", prob: 60 },
      { desc: "Storm damage repair quote", val: 4500, stage: "negotiation", prob: 75 },
    ],
    seedTasks: [
      { title: "Site visit: Johnson Residence", priority: "high" },
      { title: "Submit permit application for Martinez job", priority: "medium" },
      { title: "Order shingles for Williams Home", priority: "medium" },
    ],
  },
  hvac: {
    type: "hvac",
    riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 },
    seedContacts: [
      { name: "Thompson Property Mgmt", type: "customer", phone: "555-0201", tags: ["commercial"] },
      { name: "Garcia Household", type: "lead", phone: "555-0202", tags: ["homeowner"] },
      { name: "Park Residence", type: "lead", phone: "555-0203", tags: ["homeowner"] },
    ],
    seedDeals: [
      { desc: "AC unit installation", val: 6500, stage: "proposal", prob: 55 },
      { desc: "Annual maintenance contract", val: 1200, stage: "negotiation", prob: 80 },
    ],
    seedTasks: [
      { title: "Schedule AC tune-up for Thompson", priority: "high" },
      { title: "Order replacement parts for Garcia job", priority: "medium" },
      { title: "Follow up on Park maintenance quote", priority: "medium" },
    ],
  },
  plumbing: {
    type: "plumbing",
    riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 },
    seedContacts: [
      { name: "Davis Home Services", type: "customer", phone: "555-0301", tags: ["homeowner"] },
      { name: "Miller Residence", type: "lead", phone: "555-0302", tags: ["homeowner"] },
      { name: "Wilson Property", type: "lead", phone: "555-0303", tags: ["homeowner"] },
    ],
    seedDeals: [
      { desc: "Water heater replacement", val: 2200, stage: "proposal", prob: 65 },
      { desc: "Drain line repair & repiping", val: 5800, stage: "negotiation", prob: 70 },
    ],
    seedTasks: [
      { title: "Inspect Davis water heater", priority: "high" },
      { title: "Prepare Miller repiping quote", priority: "medium" },
      { title: "Pick up parts for Wilson job", priority: "low" },
    ],
  },
  solar: {
    type: "solar",
    riskLimits: { maxAutoSpend: 2000, approvalAbove: 20000 },
    seedContacts: [
      { name: "Anderson Homestead", type: "customer", phone: "555-0401", tags: ["homeowner"] },
      { name: "Taylor Residence", type: "lead", phone: "555-0402", tags: ["homeowner"] },
      { name: "Robinson Property", type: "lead", phone: "555-0403", tags: ["homeowner"] },
    ],
    seedDeals: [
      { desc: "25-panel solar install", val: 32000, stage: "proposal", prob: 50 },
      { desc: "Battery storage add-on", val: 8500, stage: "negotiation", prob: 72 },
    ],
    seedTasks: [
      { title: "Site survey: Anderson Homestead", priority: "high" },
      { title: "File utility interconnect application", priority: "high" },
      { title: "Submit HOA approval for Taylor project", priority: "medium" },
    ],
  },
  construction: {
    type: "construction",
    riskLimits: { maxAutoSpend: 2000, approvalAbove: 25000 },
    seedContacts: [
      { name: "Heritage Developers LLC", type: "customer", phone: "555-0501", tags: ["commercial"] },
      { name: "Patel Property Group", type: "lead", phone: "555-0502", tags: ["commercial"] },
      { name: "Chen Renovations", type: "lead", phone: "555-0503", tags: ["residential"] },
    ],
    seedDeals: [
      { desc: "Commercial buildout project", val: 85000, stage: "proposal", prob: 45 },
      { desc: "Home renovation — kitchen & bath", val: 28000, stage: "negotiation", prob: 68 },
    ],
    seedTasks: [
      { title: "Submit bid for Heritage project", priority: "high" },
      { title: "Order lumber for Chen renovation", priority: "medium" },
      { title: "Schedule subcontractor for Patel walkthrough", priority: "medium" },
    ],
  },
  agency: {
    type: "agency",
    riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 },
    seedContacts: [
      { name: "Apex Retail Co.", type: "customer", email: "ops@apexretail.com", tags: ["client"] },
      { name: "Summit Brands", type: "lead", email: "hello@summitbrands.com", tags: ["prospect"] },
      { name: "Nova Tech", type: "lead", email: "info@novatech.io", tags: ["prospect"] },
    ],
    seedDeals: [
      { desc: "Social media management retainer", val: 3000, stage: "proposal", prob: 60 },
      { desc: "Brand identity package", val: 7500, stage: "negotiation", prob: 75 },
    ],
    seedTasks: [
      { title: "Send Apex monthly report", priority: "high" },
      { title: "Prepare Summit Brands proposal deck", priority: "medium" },
      { title: "Schedule onboarding call with Nova Tech", priority: "medium" },
    ],
  },
  ecommerce: {
    type: "ecommerce",
    riskLimits: { maxAutoSpend: 300, approvalAbove: 3000 },
    seedContacts: [
      { name: "Repeat Customer: Sarah K.", type: "customer", email: "sarah.k@email.com", tags: ["vip"] },
      { name: "At-Risk: Mike T.", type: "customer", email: "mike.t@email.com", tags: ["churn-risk"] },
      { name: "New Signup: Jenny R.", type: "lead", email: "jenny.r@email.com", tags: ["new"] },
    ],
    seedDeals: [
      { desc: "Bulk order — Q4 promotion", val: 2200, stage: "negotiation", prob: 70 },
      { desc: "Wholesale inquiry", val: 5000, stage: "proposal", prob: 40 },
    ],
    seedTasks: [
      { title: "Review abandoned cart campaign performance", priority: "high" },
      { title: "Restock top-selling SKUs", priority: "high" },
      { title: "Set up post-purchase email flow", priority: "medium" },
    ],
  },
  saas: {
    type: "saas",
    riskLimits: { maxAutoSpend: 1000, approvalAbove: 10000 },
    seedContacts: [
      { name: "Momentum Corp", type: "customer", email: "admin@momentum.com", tags: ["enterprise"] },
      { name: "StartupXYZ", type: "lead", email: "founder@startupxyz.com", tags: ["smb"] },
      { name: "Scale Partners", type: "lead", email: "ops@scalepartners.com", tags: ["smb"] },
    ],
    seedDeals: [
      { desc: "Annual enterprise license — 50 seats", val: 18000, stage: "negotiation", prob: 72 },
      { desc: "SMB trial conversion", val: 4800, stage: "proposal", prob: 55 },
    ],
    seedTasks: [
      { title: "Send Momentum Corp renewal invoice", priority: "high" },
      { title: "Schedule demo for StartupXYZ", priority: "medium" },
      { title: "Follow up on Scale Partners trial", priority: "medium" },
    ],
  },
  services: {
    type: "services",
    riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 },
    seedContacts: [
      { name: "Henderson Property", type: "customer", phone: "555-0801", tags: ["homeowner"] },
      { name: "Nguyen Residence", type: "lead", phone: "555-0802", tags: ["homeowner"] },
      { name: "Ortega Commercial Building", type: "lead", phone: "555-0803", tags: ["commercial"] },
    ],
    seedDeals: [
      { desc: "Service call & repair estimate", val: 1800, stage: "proposal", prob: 65 },
      { desc: "Annual maintenance contract", val: 3600, stage: "negotiation", prob: 78 },
    ],
    seedTasks: [
      { title: "Schedule site visit: Henderson", priority: "high" },
      { title: "Prepare quote for Nguyen job", priority: "medium" },
      { title: "Follow up on Ortega contract renewal", priority: "medium" },
    ],
  },
  other: {
    type: "other",
    riskLimits: { maxAutoSpend: 500, approvalAbove: 5000 },
    seedContacts: [
      { name: "First Customer", type: "customer", email: "customer@example.com", tags: [] },
      { name: "New Lead A", type: "lead", email: "leada@example.com", tags: [] },
      { name: "New Lead B", type: "lead", email: "leadb@example.com", tags: [] },
    ],
    seedDeals: [
      { desc: "Initial proposal", val: 2500, stage: "proposal", prob: 50 },
    ],
    seedTasks: [
      { title: "Follow up with first customer", priority: "medium" },
      { title: "Prepare initial proposal", priority: "high" },
    ],
  },
};

const INDUSTRY_ICONS = {
  roofing: "RFG", hvac: "HVC", plumbing: "PLB", solar: "SOL", construction: "CON",
  agency: "AGY", ecommerce: "ECM", saas: "SAS", services: "SVC", other: "OTH",
};

const INDUSTRY_OPTIMIZED_FOR = {
  roofing: "Job costing, project tracking, subcontractors",
  hvac: "Service contracts, seasonal demand, technician scheduling",
  plumbing: "Emergency dispatch, quote management, parts tracking",
  solar: "Long sales cycles, permits, utility interconnects",
  construction: "Large bids, subcontractors, project milestones",
  agency: "Client retention, billable hours, pipeline management",
  ecommerce: "Order volume, inventory, repeat purchase rate",
  saas: "ARR, churn, trial conversions, renewal timing",
  services: "Recurring revenue, client health, contract renewals",
  other: "Contacts, deals, invoices, and task management",
};

const STEPS = [
  "Your Business",
  "How You Operate",
  "Your Deal Flow",
  "Communication Rules",
  "Agent Guardrails",
  "Bring Your Data",
  "Power Your AI Team",
];

export default function Setup({ onComplete }) {
  const { workspace, setWorkspace } = useAuth();
  const settings = workspace?.settings || {};

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: workspace?.name || "",
    type: settings.industry || "services",
    autoExec: settings.autoExec !== false,
    dailyEmailLimit: settings.riskLimits?.dailyEmailLimit || 50,
    maxAutoSpend: settings.riskLimits?.maxAutoSpend || 500,
    refundThreshold: settings.riskLimits?.refundThreshold || 100,
    approvalAbove: settings.riskLimits?.approvalAbove || 5000,
    typicalDealSize: Math.round((settings.riskLimits?.approvalAbove || 5000) / 2),
    importText: "",
    apiKey: "",
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

  async function finish() {
    setSaving(true);
    setError(null);

    try {
      const updatedWorkspace = await api.patch("/workspaces/" + workspace.id, {
        name: form.name,
        industry: form.type,
        settings: {
          setupCompleted: true,
          autoExec: form.autoExec,
          riskLimits: {
            maxAutoSpend: Number(form.maxAutoSpend),
            refundThreshold: Number(form.refundThreshold),
            approvalAbove: Number(form.approvalAbove),
            dailyEmailLimit: Number(form.dailyEmailLimit),
          },
        },
      });

      const existingContacts = await api.get("/contacts");
      const isFirstTime = !existingContacts || existingContacts.length === 0;

      if (isFirstTime) {
        const defaults = INDUSTRY_DEFAULTS[form.type];
        if (defaults) {
          const contactPromises = (defaults.seedContacts || []).map((c) =>
            api.post("/contacts", {
              name: c.name,
              type: c.type,
              phone: c.phone || null,
              email: c.email || null,
              tags: [...(c.tags || []), "sample"],
            })
          );
          const createdContacts = await Promise.all(contactPromises);

          const dealPromises = (defaults.seedDeals || []).map((d, i) =>
            api.post("/deals", {
              desc: d.desc,
              val: d.val,
              stage: d.stage,
              prob: d.prob,
              cid: createdContacts[Math.min(i, createdContacts.length - 1)]?.id || null,
            })
          );

          const taskPromises = (defaults.seedTasks || []).map((t) =>
            api.post("/tasks", {
              title: t.title,
              priority: t.priority || "medium",
              st: "todo",
            })
          );

          await Promise.all([...dealPromises, ...taskPromises]);
        }
      }

      setWorkspace(updatedWorkspace);

      // Save AI provider key if entered
      if (form.apiKey.trim()) {
        try {
          await api.put("/credentials/anthropic", { credentials: { api_key: form.apiKey.trim() } });
        } catch (e) { /* non-fatal */ }
      }

      // The server triggers the initial agent cycle via triggerInitialScan when
      // setupCompleted transitions to true. Show the activating transition here
      // so the owner feels the team coming alive, then call onComplete.
      setActivating(true);
      setTimeout(() => {
        onComplete();
      }, 2500);
    } catch (err) {
      setError(err.message || "Setup failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const stepContent = [
    // Step 0: Business Identity
    <div key="s0">
      <p className={styles.stepSubtitle}>
        Tell Autonome about your business so it can personalize your experience.
      </p>
      <Input label="Business Name" value={form.name} onChange={set("name")} placeholder="e.g. ABC Roofing LLC" />
      <div style={{ marginBottom: "var(--space-4)" }}>
        <div className={styles.industryHeader}>Industry</div>
        <div className={styles.industryHelp}>
          Your industry determines how your five AI specialists analyze your business — what they monitor, what they prioritize, and how they communicate.
        </div>
        <div className={styles.industryGrid}>
          {Object.keys(INDUSTRY_DEFAULTS).map((k) => (
            <div
              key={k}
              className={`${styles.industryCard} ${form.type === k ? styles.industryCardActive : ""}`}
              onClick={() => applyIndustryDefaults(k)}
            >
              <div className={styles.industryIcon}>{INDUSTRY_ICONS[k] || "OTH"}</div>
              <div className={styles.industryLabel}>{k.charAt(0).toUpperCase() + k.slice(1)}</div>
              {INDUSTRY_OPTIMIZED_FOR[k] && (
                <div className={styles.industryOptimized}>{INDUSTRY_OPTIMIZED_FOR[k]}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,

    // Step 1: Service Model
    <div key="s1">
      <p className={styles.stepSubtitle}>How does your business deliver value?</p>
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
      <p className={styles.stepSubtitle}>Set your revenue model parameters.</p>
      <Input label="Typical Deal Size ($)" type="number" value={String(form.typicalDealSize)} onChange={(v) => setForm((f) => ({ ...f, typicalDealSize: Number(v) }))} placeholder="5000" />
      <div className={styles.formRow}>
        <Input label="Max Auto-Spend ($)" type="number" value={String(form.maxAutoSpend)} onChange={set("maxAutoSpend")} placeholder="500" style={{ flex: 1 }} />
        <Input label="Approval Threshold ($)" type="number" value={String(form.approvalAbove)} onChange={set("approvalAbove")} placeholder="5000" style={{ flex: 1 }} />
      </div>
    </div>,

    // Step 3: Communication Rules
    <div key="s3">
      <p className={styles.stepSubtitle}>Set communication preferences for your AI team.</p>
      <Input
        label="How many emails should your AI team send per day?"
        type="number"
        value={String(form.dailyEmailLimit)}
        onChange={set("dailyEmailLimit")}
        placeholder="50"
      />
      <p className={styles.textareaHint}>Your agents will stay within this limit when sending follow-ups, reminders, and outreach.</p>
      <div className={styles.checkboxRow}>
        <input type="checkbox" id="autoExec" checked={form.autoExec} onChange={(e) => set("autoExec")(e.target.checked)} />
        <label htmlFor="autoExec" className={styles.checkboxLabel}>
          Allow your AI team to take safe actions automatically (no approval needed for low-risk tasks)
        </label>
      </div>
    </div>,

    // Step 4: Agent Guardrails
    <div key="s4">
      <p className={styles.stepSubtitle}>Tell your AI team when to act on their own and when to check with you first.</p>
      <Input
        label="What's the most your AI team should spend without asking?"
        type="number"
        value={String(form.maxAutoSpend)}
        onChange={set("maxAutoSpend")}
        placeholder="500"
      />
      <p className={styles.textareaHint}>Purchases, credits, or fees below this amount will be handled automatically.</p>
      <Input
        label="What's the most they should refund without checking?"
        type="number"
        value={String(form.refundThreshold)}
        onChange={set("refundThreshold")}
        placeholder="100"
      />
      <p className={styles.textareaHint}>Refunds below this amount are issued automatically to keep customers happy.</p>
      <Input
        label="At what dollar amount should they always get your approval?"
        type="number"
        value={String(form.approvalAbove)}
        onChange={set("approvalAbove")}
        placeholder="5000"
      />
      <p className={styles.textareaHint}>Any action above this threshold is sent to you for review before it's taken.</p>
    </div>,

    // Step 5: Bring Your Data
    <div key="s5">
      <p className={styles.stepSubtitle}>Optionally paste existing customer or deal data to import.</p>
      <textarea
        className={styles.textarea}
        value={form.importText}
        onChange={(e) => setForm((f) => ({ ...f, importText: e.target.value }))}
        placeholder="Paste customer names, emails, deal information..."
      />
      <p className={styles.textareaHint}>
        Autonome will parse this text and extract contacts, deals, and tasks.
      </p>
    </div>,

    // Step 6: Power Your AI Team
    <div key="s6">
      <p className={styles.stepSubtitle}>
        Enter your Anthropic API key to power all 5 specialist agents with advanced intelligence.
        You can also do this later in Connections.
      </p>
      <Input
        label="Anthropic API Key"
        type="password"
        value={form.apiKey}
        onChange={set("apiKey")}
        placeholder="sk-ant-api…"
      />
      <p className={styles.textareaHint}>
        Your key is stored securely and never shared. It unlocks advanced analysis, synthesis, and proactive recommendations across your entire AI team.
      </p>
    </div>,
  ];

  return (
    <div className={styles.page}>
      {activating ? (
        <div className={styles.card}>
          <div className={styles.activatingScreen}>
            <div className={styles.activatingAgents}>
              {Object.entries(AgentMeta).map(([key, meta]) => (
                <div
                  key={key}
                  className={styles.activatingAgent}
                  style={{ background: meta.bg, color: meta.color, borderColor: `${meta.color}30` }}
                  title={meta.title}
                >
                  {meta.icon}
                </div>
              ))}
            </div>
            <div className={styles.activatingTitle}>Your AI team is now active</div>
            <div className={styles.activatingDesc}>
              Finance, Revenue, Operations, Growth, and Support are scanning your business…
            </div>
          </div>
        </div>
      ) : (
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoTitle}>Autonome</div>
          <div className={styles.logoSub}>Your AI Business Operator</div>
        </div>

        <div className={styles.stepProgress}>
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`${styles.stepDot} ${i < step ? styles.stepDotDone : i === step ? styles.stepDotActive : ""}`}
            />
          ))}
        </div>

        <h2 className={styles.stepTitle}>{STEPS[step]}</h2>
        <div className={styles.stepMeta}>Step {step + 1} of {STEPS.length}</div>

        {stepContent[step]}

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => (step > 0 ? setStep(step - 1) : null)}
            disabled={step === 0 || saving}
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
            <Button onClick={finish} disabled={!form.name || saving}>
              {saving ? "Saving…" : "Complete Setup"}
            </Button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
