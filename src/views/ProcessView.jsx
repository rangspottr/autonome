import { useState } from "react";
import { T } from "../lib/theme.js";
import { parseText } from "../lib/parser.js";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";

export default function ProcessView() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [selected, setSelected] = useState({ contacts: {}, intents: {} });

  async function processText() {
    if (!text.trim()) return;
    setProcessing(true);
    try {
      const parsed = parseText(text);
      setResult(parsed);
      const defaultContacts = {};
      const defaultIntents = {};
      (parsed.contacts || []).forEach((c) => { defaultContacts[c.id] = true; });
      (parsed.intents || []).forEach((_, i) => { defaultIntents[i] = true; });
      setSelected({ contacts: defaultContacts, intents: defaultIntents });
    } finally {
      setProcessing(false);
    }
  }

  function toggleSelectAll() {
    const allContactsSelected = (result?.contacts || []).every((c) => selected.contacts[c.id]);
    const allIntentsSelected = (result?.intents || []).every((_, i) => selected.intents[i]);
    const allSelected = allContactsSelected && allIntentsSelected;
    const newContacts = {};
    const newIntents = {};
    (result?.contacts || []).forEach((c) => { newContacts[c.id] = !allSelected; });
    (result?.intents || []).forEach((_, i) => { newIntents[i] = !allSelected; });
    setSelected({ contacts: newContacts, intents: newIntents });
  }

  const selectedContactCount = (result?.contacts || []).filter((c) => selected.contacts[c.id]).length;
  const selectedIntentCount = (result?.intents || []).filter((_, i) => selected.intents[i]).length;

  async function importResults() {
    if (!result) return;
    setImporting(true);
    try {
      const selectedContacts = result.contacts.filter((c) => selected.contacts[c.id]);
      const selectedIntents = result.intents.filter((_, i) => selected.intents[i]);

      const promises = [];

      if (selectedContacts.length > 0) {
        promises.push(
          api.post("/contacts", {
            contacts: selectedContacts.map((c) => ({
              name: c.name,
              email: c.email || null,
              phone: c.phone || null,
              type: c.type || "lead",
            })),
          })
        );
      }

      const tasks = selectedIntents.filter((i) => i.type === "schedule_meeting");
      if (tasks.length > 0) {
        promises.push(
          api.post("/tasks", {
            tasks: tasks.map((t) => ({
              title: t.description,
              priority: result.isUrgent ? "high" : "medium",
            })),
          })
        );
      }

      const invoices = selectedIntents.filter((i) => i.type === "invoice_collection" && i.amount > 0);
      if (invoices.length > 0) {
        const client = selectedContacts[0] || result.contacts[0];
        promises.push(
          api.post("/invoices", {
            invoices: invoices.map((inv) => ({
              description: inv.description,
              amount: inv.amount,
              email: client?.email || null,
            })),
          })
        );
      }

      await Promise.all(promises);
      setImported(true);
      setTimeout(() => setImported(false), 2000);
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Process View</h2>
        <div style={{ fontSize: 13, color: T.dm }}>
          Paste any text — notes, emails, messages — and Autonome will extract contacts, intents, and actions.
        </div>
      </div>

      {/* Input */}
      <Card style={{ marginBottom: 16 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text here — e.g. 'John Smith from ABC Roofing called about an unpaid invoice of $3,500. He said he will pay by Friday. Also, Sarah at XYZ called asking for a quote on a new HVAC system...'"
          style={{
            width: "100%",
            height: 160,
            padding: "10px 12px",
            border: `1px solid ${T.bd}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            resize: "vertical",
            boxSizing: "border-box",
            color: T.tx,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Button onClick={processText} disabled={processing || !text.trim()}>
            {processing ? "Processing…" : "Process Text →"}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <div>
          {/* Sentiment + urgency */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Pill label={`Sentiment: ${result.sentiment}`} variant={result.sentiment === "positive" ? "green" : result.sentiment === "negative" ? "red" : result.sentiment === "urgent" ? "amber" : "muted"} />
            {result.isUrgent && <Pill label="URGENT" variant="red" />}
            {result.amounts.length > 0 && (
              <Pill label={`$${result.amounts[0].toLocaleString()} detected`} variant="blue" />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {/* Contacts */}
            <Card style={{ marginBottom: 0 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: T.tx }}>
                Contacts ({result.contacts.length})
              </h3>
              {result.contacts.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No contacts detected.</p>}
              {result.contacts.map((c) => (
                <div key={c.id} style={{ padding: "6px 0", borderBottom: `1px solid ${T.bd}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!selected.contacts[c.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, contacts: { ...s.contacts, [c.id]: e.target.checked } }))}
                    style={{ marginTop: 2, cursor: "pointer" }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: T.mt }}>{c.email || c.phone || "no contact info"}</div>
                  </div>
                </div>
              ))}
            </Card>

            {/* Intents */}
            <Card style={{ marginBottom: 0 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: T.tx }}>
                Intents ({result.intents.length})
              </h3>
              {result.intents.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No intents detected.</p>}
              {result.intents.map((intent, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.bd}`, display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!selected.intents[i]}
                    onChange={(e) => setSelected((s) => ({ ...s, intents: { ...s.intents, [i]: e.target.checked } }))}
                    style={{ marginTop: 2, cursor: "pointer" }}
                  />
                  <div>
                    <Pill label={intent.type.replace(/_/g, " ")} variant="blue" />
                    <div style={{ fontSize: 12, color: T.dm, marginTop: 4 }}>{intent.description}</div>
                    {intent.amount && <div style={{ fontSize: 12, color: T.gn }}>${intent.amount.toLocaleString()}</div>}
                  </div>
                </div>
              ))}
            </Card>
          </div>

          {/* Actions detected */}
          {result.actions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.dm, marginBottom: 6 }}>Actions Detected:</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {result.actions.map((a) => <Pill key={a} label={a.replace(/_/g, " ")} variant="purple" />)}
              </div>
            </div>
          )}

          {/* Import controls */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Button onClick={importResults} disabled={importing || imported || (selectedContactCount === 0 && selectedIntentCount === 0)}>
              {importing ? "Importing…" : imported ? "Imported!" : `Import ${selectedContactCount} of ${result.contacts.length} contact${result.contacts.length !== 1 ? "s" : ""} & ${selectedIntentCount} of ${result.intents.length} intent${result.intents.length !== 1 ? "s" : ""}`}
            </Button>
            <Button variant="secondary" size="sm" onClick={toggleSelectAll}>
              {(result.contacts.every((c) => selected.contacts[c.id]) && result.intents.every((_, i) => selected.intents[i])) ? "Deselect All" : "Select All"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
