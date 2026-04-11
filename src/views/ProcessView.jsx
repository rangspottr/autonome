import { useState } from "react";
import { T } from "../lib/theme.js";
import { uid, iso } from "../lib/utils.js";
import { parseText, parseTextWithAI } from "../lib/parser.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";

export default function ProcessView({ db, onUpdate }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [imported, setImported] = useState(false);

  async function processText() {
    if (!text.trim()) return;
    setProcessing(true);
    try {
      let parsed = null;

      if (db.cfg.keys?.llm) {
        parsed = await parseTextWithAI(text, db.cfg.keys.llm);
      }

      if (!parsed) {
        parsed = parseText(text);
      }

      setResult(parsed);
    } finally {
      setProcessing(false);
    }
  }

  function importResults() {
    if (!result) return;
    const updated = JSON.parse(JSON.stringify(db));

    // Import contacts
    result.contacts.forEach((c) => {
      if (!updated.contacts.some((x) => x.email === c.email && c.email)) {
        updated.contacts.push({ id: uid(), ...c, createdAt: iso(), tags: [] });
      }
    });

    // Create tasks from intents
    result.intents.forEach((intent) => {
      if (intent.type === "schedule_meeting") {
        updated.tasks.push({
          id: uid(),
          title: intent.description,
          st: "todo",
          priority: result.isUrgent ? "high" : "medium",
          createdAt: iso(),
        });
      }
    });

    // Create invoices from collection intents
    result.intents.forEach((intent) => {
      if (intent.type === "invoice_collection" && intent.amount > 0) {
        const client = result.contacts[0];
        updated.txns.push({
          id: uid(),
          desc: intent.description,
          amt: intent.amount,
          type: "inv",
          st: "pending",
          at: iso(),
          email: client?.email || null,
        });
      }
    });

    // Memory entry
    if (result.contacts.length > 0) {
      result.contacts.forEach((c) => {
        const existing = updated.contacts.find((x) => x.email === c.email && c.email);
        const cid = existing?.id || null;
        if (cid) {
          updated.memory.push({
            id: uid(),
            at: iso(),
            contactId: cid,
            type: "note",
            text: `Processed: ${text.slice(0, 200)}`,
            agent: "process",
            tags: result.actions,
            sentiment: result.sentiment,
            source: "process_view",
            linkedEntityId: null,
            linkedEntityType: null,
          });
        }
      });
    }

    updated.audit.push({
      id: uid(),
      at: iso(),
      agent: "Process",
      action: "import",
      desc: `Processed text: extracted ${result.contacts.length} contacts, ${result.intents.length} intents`,
      auto: false,
    });

    onUpdate(updated);
    setImported(true);
    setTimeout(() => setImported(false), 2000);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Process View</h2>
        <div style={{ fontSize: 13, color: T.dm }}>
          Paste any text — notes, emails, messages — and Autonome will extract contacts, intents, and actions.
          {db.cfg.keys?.llm ? " AI extraction enabled." : " Using rule-based parser (add LLM key in Settings for AI extraction)."}
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
                <div key={c.id} style={{ padding: "6px 0", borderBottom: `1px solid ${T.bd}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.mt }}>{c.email || c.phone || "no contact info"}</div>
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
                <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.bd}` }}>
                  <Pill label={intent.type.replace(/_/g, " ")} variant="blue" />
                  <div style={{ fontSize: 12, color: T.dm, marginTop: 4 }}>{intent.description}</div>
                  {intent.amount && <div style={{ fontSize: 12, color: T.gn }}>${intent.amount.toLocaleString()}</div>}
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

          {/* Import button */}
          <Button onClick={importResults} disabled={imported}>
            {imported ? "✓ Imported!" : `Import ${result.contacts.length} contacts & ${result.intents.length} intents`}
          </Button>
        </div>
      )}
    </div>
  );
}
