import { useState } from "react";
import { T } from "../lib/theme.js";
import { uid, iso, $$, sd, da } from "../lib/utils.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Row from "../components/Row.jsx";

const STAGES = ["prospect", "qualified", "proposal", "negotiation", "closed"];
const STAGE_COLORS = { prospect: "muted", qualified: "blue", proposal: "purple", negotiation: "amber", closed: "green" };

export default function SalesView({ db, onUpdate }) {
  const [tab, setTab] = useState("contacts");
  const [showContactForm, setShowContactForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(null);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", type: "lead", company: "" });
  const [dealForm, setDealForm] = useState({ cid: "", title: "", val: "", stage: "prospect", prob: "20", notes: "" });

  const contacts = db.contacts || [];
  const deals = db.deals || [];

  const setC = (k) => (v) => setContactForm((f) => ({ ...f, [k]: v }));
  const setD = (k) => (v) => setDealForm((f) => ({ ...f, [k]: v }));

  function saveContact() {
    const updated = JSON.parse(JSON.stringify(db));
    const contact = { id: uid(), ...contactForm, createdAt: iso(), tags: [] };
    updated.contacts = [...(updated.contacts || []), contact];
    onUpdate(updated);
    setShowContactForm(false);
    setContactForm({ name: "", email: "", phone: "", type: "lead", company: "" });
  }

  function saveDeal() {
    const updated = JSON.parse(JSON.stringify(db));
    const deal = {
      id: uid(),
      cid: dealForm.cid,
      title: dealForm.title,
      val: Number(dealForm.val) || 0,
      stage: dealForm.stage,
      prob: Number(dealForm.prob) || 20,
      notes: dealForm.notes,
      at: iso(),
      createdAt: iso(),
    };
    updated.deals = [...(updated.deals || []), deal];
    onUpdate(updated);
    setShowDealForm(false);
    setDealForm({ cid: "", title: "", val: "", stage: "prospect", prob: "20", notes: "" });
  }

  function advanceDeal(deal) {
    const updated = JSON.parse(JSON.stringify(db));
    const d = updated.deals.find((x) => x.id === deal.id);
    if (!d) return;
    const idx = STAGES.indexOf(d.stage);
    if (idx < STAGES.length - 1) {
      d.stage = STAGES[idx + 1];
      d.at = iso();
      if (d.stage === "closed") {
        updated.outcomes.dealsClosed = (updated.outcomes.dealsClosed || 0) + 1;
        updated.outcomes.collected = (updated.outcomes.collected || 0) + (d.val || 0);
      }
    }
    onUpdate(updated);
  }

  const pipelineValue = deals.filter((d) => d.stage !== "closed").reduce((s, d) => s + (d.val || 0), 0);
  const closedValue = deals.filter((d) => d.stage === "closed").reduce((s, d) => s + (d.val || 0), 0);

  const getContactMemory = (cid) =>
    (db.memory || []).filter((m) => m.contactId === cid).sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div>
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
            const cDeals = deals.filter((d) => d.cid === c.id);
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
            const contact = contacts.find((c) => c.id === deal.cid);
            const stale = da(deal.at);
            return (
              <Row key={deal.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
                    {deal.title || contact?.name || "Unnamed Deal"}
                  </div>
                  <div style={{ fontSize: 11, color: T.mt }}>
                    {contact?.name} · {$$(deal.val)} · {stale}d ago
                  </div>
                </div>
                <Pill label={deal.stage} variant={STAGE_COLORS[deal.stage] || "muted"} />
                <Pill label={`${deal.prob}%`} variant="muted" />
                {deal.stage !== "closed" && (
                  <Button size="sm" onClick={() => advanceDeal(deal)}>Advance →</Button>
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
            const stageValue = stageDeals.reduce((s, d) => s + (d.val || 0), 0);
            return (
              <div key={stage} style={{ minWidth: 200, background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.dm, textTransform: "uppercase" }}>{stage}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{$$(stageValue)}</div>
                </div>
                {stageDeals.map((d) => {
                  const c = contacts.find((x) => x.id === d.cid);
                  return (
                    <div key={d.id} style={{ background: T.bg, borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{c?.name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: T.mt }}>{$$(d.val)} · {d.prob}%</div>
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
            const memory = getContactMemory(showTimeline);
            return (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.tx, marginBottom: 12 }}>{c?.name}</div>
                {memory.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No activity yet.</p>}
                {memory.map((m) => (
                  <div key={m.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.bd}` }}>
                    <div style={{ fontSize: 12, color: T.mt }}>{new Date(m.at).toLocaleDateString()}</div>
                    <div style={{ fontSize: 13, color: T.tx }}>{m.text}</div>
                    {m.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {m.tags.map((tag) => <Pill key={tag} label={tag} variant="muted" />)}
                      </div>
                    )}
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
          <Select label="Contact" value={dealForm.cid} onChange={setD("cid")} options={[{ value: "", label: "Select contact..." }, ...contacts.map((c) => ({ value: c.id, label: c.name }))]} />
          <Input label="Deal Title" value={dealForm.title} onChange={setD("title")} placeholder="Website Redesign" />
          <Input label="Value ($)" type="number" value={dealForm.val} onChange={setD("val")} placeholder="5000" />
          <Select label="Stage" value={dealForm.stage} onChange={setD("stage")} options={STAGES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
          <Input label="Win Probability (%)" type="number" value={dealForm.prob} onChange={setD("prob")} placeholder="50" />
        </Dialog>
      )}
    </div>
  );
}
