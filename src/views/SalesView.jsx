import { useState, useEffect, useCallback } from "react";
import { T } from "../lib/theme.js";
import { $$, sd, da } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Row from "../components/Row.jsx";

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

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: T.mt, fontSize: 14 }}>
        Loading sales data…
      </div>
    );
  }

  const pipelineValue = deals.filter((d) => d.stage !== "closed").reduce((s, d) => s + (d.value || 0), 0);
  const closedValue = deals.filter((d) => d.stage === "closed").reduce((s, d) => s + (d.value || 0), 0);

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#dc2626", flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Contacts", value: contacts.length, color: T.bl },
          { label: "Leads", value: contacts.filter((c) => c.type === "lead").length, color: T.am },
          { label: "Pipeline", value: $$(pipelineValue), color: T.bl },
          { label: "Closed", value: $$(closedValue), color: T.gn },
        ].map((m) => (
          <div key={m.label} style={{ background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.dm }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["contacts", "Contacts"], ["deals", "Deals"], ["pipeline", "Pipeline"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: tab === key ? T.bl : T.bd, color: tab === key ? "#fff" : T.dm, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => (tab === "contacts" ? setShowContactForm(true) : setShowDealForm(true))}>
          + Add {tab === "contacts" ? "Contact" : "Deal"}
        </Button>
      </div>

      {/* Contacts */}
      {tab === "contacts" && (
        <Card>
          {contacts.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No contacts yet.</p>}
          {contacts.map((c) => {
            const cDeals = deals.filter((d) => d.contact_id === c.id);
            return (
              <Row key={c.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.mt }}>{c.email || c.phone || "No contact info"}</div>
                </div>
                <Pill label={c.type} variant={c.type === "lead" ? "amber" : c.type === "qualified" ? "blue" : "green"} />
                {cDeals.length > 0 && <Pill label={`${cDeals.length} deal${cDeals.length > 1 ? "s" : ""}`} variant="purple" />}
                <Button size="sm" variant="secondary" onClick={() => setShowTimeline(c.id)}>Timeline</Button>
              </Row>
            );
          })}
        </Card>
      )}

      {/* Deals */}
      {tab === "deals" && (
        <Card>
          {deals.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No deals yet.</p>}
          {deals.map((deal) => {
            const contact = contacts.find((c) => c.id === deal.contact_id);
            const stale = da(deal.updated_at || deal.created_at);
            return (
              <Row key={deal.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
                    {deal.title || contact?.name || "Unnamed Deal"}
                  </div>
                  <div style={{ fontSize: 11, color: T.mt }}>
                    {contact?.name} · {$$(deal.value)} · {stale}d ago
                  </div>
                </div>
                <Pill label={deal.stage} variant={STAGE_COLORS[deal.stage] || "muted"} />
                <Pill label={`${deal.probability}%`} variant="muted" />
                {deal.stage !== "closed" && (
                  <Button size="sm" disabled={saving} onClick={() => advanceDeal(deal)}>Advance →</Button>
                )}
              </Row>
            );
          })}
        </Card>
      )}

      {/* Pipeline view */}
      {tab === "pipeline" && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {STAGES.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage);
            const stageValue = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
            return (
              <div key={stage} style={{ minWidth: 200, background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.dm, textTransform: "uppercase" }}>{stage}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{$$(stageValue)}</div>
                </div>
                {stageDeals.map((d) => {
                  const c = contacts.find((x) => x.id === d.contact_id);
                  return (
                    <div key={d.id} style={{ background: T.bg, borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{c?.name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: T.mt }}>{$$(d.value)} · {d.probability}%</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

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
                <div style={{ fontSize: 15, fontWeight: 700, color: T.tx, marginBottom: 12 }}>{c?.name}</div>
                {contactDeals.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No deal history yet.</p>}
                {contactDeals.map((d) => (
                  <div key={d.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.bd}` }}>
                    <div style={{ fontSize: 12, color: T.mt }}>{new Date(d.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: 13, color: T.tx }}>{d.title || "Untitled Deal"} — {$$(d.value)}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
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
