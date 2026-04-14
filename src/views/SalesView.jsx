import { useState, useEffect, useCallback } from "react";
// eslint-disable-next-line no-unused-vars
import { $$, sd, da } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Stat from "../components/Stat.jsx";
import Table from "../components/Table.jsx";
import Tabs from "../components/Tabs.jsx";
import styles from "./SalesView.module.css";

const STAGES = ["prospect", "qualified", "proposal", "negotiation", "closed"];
const STAGE_COLORS = { prospect: "muted", qualified: "blue", proposal: "purple", negotiation: "amber", closed: "green" };

export default function SalesView() {
  const [tab, setTab] = useState("contacts");
  const [showContactForm, setShowContactForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(null);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", type: "lead", company: "" });
  const [dealForm, setDealForm] = useState({ contact_id: "", title: "", value: "", stage: "prospect", probability: "20" });

  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [contactsData, dealsData] = await Promise.all([
        api.get("/contacts"),
        api.get("/deals"),
      ]);
      setContacts(contactsData);
      setDeals(dealsData);
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setC = (k) => (v) => setContactForm((f) => ({ ...f, [k]: v }));
  const setD = (k) => (v) => setDealForm((f) => ({ ...f, [k]: v }));

  async function saveContact() {
    try {
      setSaving(true);
      await api.post("/contacts", {
        name: contactForm.name,
        email: contactForm.email,
        phone: contactForm.phone,
        company: contactForm.company,
        type: contactForm.type,
        source: "",
        tags: [],
        metadata: {},
      });
      await fetchData();
      setShowContactForm(false);
      setContactForm({ name: "", email: "", phone: "", type: "lead", company: "" });
    } catch (err) {
      setError(err.message || "Failed to save contact");
    } finally {
      setSaving(false);
    }
  }

  async function saveDeal() {
    try {
      setSaving(true);
      await api.post("/deals", {
        contact_id: dealForm.contact_id,
        title: dealForm.title,
        value: Number(dealForm.value) || 0,
        stage: dealForm.stage,
        probability: Number(dealForm.probability) || 20,
        metadata: {},
      });
      await fetchData();
      setShowDealForm(false);
      setDealForm({ contact_id: "", title: "", value: "", stage: "prospect", probability: "20" });
    } catch (err) {
      setError(err.message || "Failed to save deal");
    } finally {
      setSaving(false);
    }
  }

  async function advanceDeal(deal) {
    const idx = STAGES.indexOf(deal.stage);
    if (idx >= STAGES.length - 1) return;
    try {
      setSaving(true);
      await api.patch(`/deals/${deal.id}`, { stage: STAGES[idx + 1] });
      await fetchData();
    } catch (err) {
      setError(err.message || "Failed to advance deal");
    } finally {
      setSaving(false);
    }
  }

  const pipelineValue = deals.filter((d) => d.stage !== "closed").reduce((s, d) => s + (d.value || 0), 0);
  const closedValue = deals.filter((d) => d.stage === "closed").reduce((s, d) => s + (d.value || 0), 0);

  const contactColumns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email", render: (v, row) => v || row.phone || "—" },
    {
      key: "type", label: "Type",
      render: (v) => <Pill label={v} variant={v === "lead" ? "amber" : v === "qualified" ? "blue" : "green"} />,
    },
    {
      key: "_deals", label: "Deals",
      render: (_, row) => {
        const cDeals = deals.filter((d) => d.contact_id === row.id);
        return cDeals.length > 0 ? <Pill label={`${cDeals.length} deal${cDeals.length > 1 ? "s" : ""}`} variant="purple" /> : null;
      },
    },
    {
      key: "_actions", label: "",
      render: (_, row) => (
        <Button size="sm" variant="secondary" onClick={() => setShowTimeline(row.id)}>Timeline</Button>
      ),
    },
  ];

  const dealColumns = [
    {
      key: "title", label: "Deal",
      render: (v, row) => {
        const contact = contacts.find((c) => c.id === row.contact_id);
        return (
          <div>
            <div className={styles.itemName}>{v || contact?.name || "Unnamed Deal"}</div>
            <div className={styles.itemMeta}>{contact?.name} · {da(row.updated_at || row.created_at)}d ago</div>
          </div>
        );
      },
    },
    { key: "value", label: "Value", align: "right", sortable: true, render: (v) => $$(v) },
    { key: "stage", label: "Stage", render: (v) => <Pill label={v} variant={STAGE_COLORS[v] || "muted"} /> },
    { key: "probability", label: "Win %", render: (v) => `${v}%` },
    {
      key: "_actions", label: "",
      render: (_, row) => row.stage !== "closed" ? (
        <Button size="sm" disabled={saving} onClick={() => advanceDeal(row)}>Advance →</Button>
      ) : null,
    },
  ];

  return (
    <div className={styles.page}>
      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className={styles.statsGrid}>
        <Stat label="Contacts" value={contacts.length} color="brand" />
        <Stat label="Leads" value={contacts.filter((c) => c.type === "lead").length} color="warning" />
        <Stat label="Pipeline" value={$$(pipelineValue)} color="brand" />
        <Stat label="Closed" value={$$(closedValue)} color="success" />
      </div>

      <Tabs
        tabs={[
          { id: "contacts", label: "Contacts", badge: contacts.length },
          { id: "deals", label: "Deals", badge: deals.length },
          { id: "pipeline", label: "Pipeline" },
        ]}
        active={tab}
        onChange={setTab}
      >
        {tab === "contacts" && (
          <>
            <div className={styles.tabRow}>
              <div className={styles.spacer} />
              <Button size="sm" onClick={() => setShowContactForm(true)}>+ Add Contact</Button>
            </div>
            <Table
              columns={contactColumns}
              data={contacts}
              loading={loading}
              emptyIcon="○"
              emptyTitle="Revenue agent is standing by"
              emptyDescription="Add your first contact to begin tracking leads and customers."
              emptyAction={<Button size="sm" onClick={() => setShowContactForm(true)}>+ Add Contact</Button>}
              emptyAgent="revenue"
              emptyStatusIndicator
            />
          </>
        )}

        {tab === "deals" && (
          <>
            <div className={styles.tabRow}>
              <div className={styles.spacer} />
              <Button size="sm" onClick={() => setShowDealForm(true)}>+ Add Deal</Button>
            </div>
            <Table
              columns={dealColumns}
              data={deals}
              loading={loading}
              emptyIcon="○"
              emptyTitle="Revenue agent is standing by"
              emptyDescription="Add your first deal to begin tracking pipeline velocity and close rates."
              emptyAction={<Button size="sm" onClick={() => setShowDealForm(true)}>+ Add Deal</Button>}
              emptyAgent="revenue"
              emptyStatusIndicator
            />
          </>
        )}

        {tab === "pipeline" && (
          <div className={styles.pipelineBoard}>
            {STAGES.map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage);
              const stageValue = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
              return (
                <div key={stage} className={styles.pipelineCol}>
                  <div className={styles.pipelineColHeader}>
                    <div className={styles.pipelineColLabel}>{stage}</div>
                    <div className={styles.pipelineColValue}>{$$(stageValue)}</div>
                  </div>
                  {stageDeals.map((d) => {
                    const c = contacts.find((x) => x.id === d.contact_id);
                    return (
                      <div key={d.id} className={styles.pipelineCard}>
                        <div className={styles.pipelineCardName}>{c?.name || "Unknown"}</div>
                        <div className={styles.pipelineCardMeta}>{$$(d.value)} · {d.probability}%</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Tabs>

      {/* Contact Timeline Dialog */}
      {showTimeline && (
        <Dialog title="Contact Timeline" onClose={() => setShowTimeline(null)}>
          {(() => {
            const c = contacts.find((x) => x.id === showTimeline);
            const contactDeals = deals
              .filter((d) => d.contact_id === showTimeline)
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return (
              <div>
                <div className={styles.timelineContactName}>{c?.name}</div>
                {contactDeals.length === 0 && <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No deal history yet.</p>}
                {contactDeals.map((d) => (
                  <div key={d.id} className={styles.timelineEntry}>
                    <div className={styles.timelineDate}>{new Date(d.created_at).toLocaleDateString()}</div>
                    <div className={styles.timelineTitle}>{d.title || "Untitled Deal"} — {$$(d.value)}</div>
                    <div className={styles.timelinePills}>
                      <Pill label={d.stage} variant={STAGE_COLORS[d.stage] || "muted"} />
                      <Pill label={`${d.probability}%`} variant="muted" />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Dialog>
      )}

      {/* Add Contact Dialog */}
      {showContactForm && (
        <Dialog title="Add Contact" onClose={() => setShowContactForm(false)} onConfirm={saveContact} confirmLabel="Save Contact">
          <Input label="Name" value={contactForm.name} onChange={setC("name")} placeholder="John Smith" />
          <Input label="Email" type="email" value={contactForm.email} onChange={setC("email")} placeholder="john@company.com" />
          <Input label="Phone" value={contactForm.phone} onChange={setC("phone")} placeholder="+1 (555) 000-0000" />
          <Input label="Company" value={contactForm.company} onChange={setC("company")} placeholder="Company LLC" />
          <Select label="Type" value={contactForm.type} onChange={setC("type")} options={[{ value: "lead", label: "Lead" }, { value: "client", label: "Client" }, { value: "prospect", label: "Prospect" }]} />
        </Dialog>
      )}

      {/* Add Deal Dialog */}
      {showDealForm && (
        <Dialog title="Add Deal" onClose={() => setShowDealForm(false)} onConfirm={saveDeal} confirmLabel="Save Deal">
          <Select label="Contact" value={dealForm.contact_id} onChange={setD("contact_id")} options={[{ value: "", label: "Select contact..." }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} />
          <Input label="Deal Title" value={dealForm.title} onChange={setD("title")} placeholder="Website Redesign" />
          <Input label="Value ($)" type="number" value={dealForm.value} onChange={setD("value")} placeholder="5000" />
          <Select label="Stage" value={dealForm.stage} onChange={setD("stage")} options={STAGES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
          <Input label="Win Probability (%)" type="number" value={dealForm.probability} onChange={setD("probability")} placeholder="50" />
        </Dialog>
      )}
    </div>
  );
}
