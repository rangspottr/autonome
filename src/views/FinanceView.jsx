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

export default function FinanceView({ db, onUpdate }) {
  const [tab, setTab] = useState("invoices");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ desc: "", amt: "", due: "", email: "", type: "inv" });

  const invoices = (db.txns || []).filter((t) => t.type === "inv");
  const income = (db.txns || []).filter((t) => t.type === "inc");
  const expenses = (db.txns || []).filter((t) => t.type === "exp");

  const totalRevenue = income.reduce((s, t) => s + (t.amt || 0), 0);
  const totalExpenses = expenses.reduce((s, t) => s + (t.amt || 0), 0);
  const totalOutstanding = invoices.filter((t) => t.st === "pending").reduce((s, t) => s + (t.amt || 0), 0);
  const totalOverdue = invoices.filter((t) => t.st === "pending" && t.due && new Date(t.due) < new Date()).reduce((s, t) => s + (t.amt || 0), 0);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function saveRecord() {
    const updated = JSON.parse(JSON.stringify(db));
    const record = {
      id: uid(),
      desc: form.desc,
      amt: Number(form.amt) || 0,
      due: form.due || null,
      email: form.email || null,
      type: form.type,
      st: form.type === "inv" ? "pending" : "paid",
      at: iso(),
    };
    updated.txns = [...(updated.txns || []), record];
    if (form.type === "inc") updated.outcomes.collected = (updated.outcomes.collected || 0) + record.amt;
    onUpdate(updated);
    setShowForm(false);
    setForm({ desc: "", amt: "", due: "", email: "", type: "inv" });
  }

  function markPaid(id) {
    const updated = JSON.parse(JSON.stringify(db));
    const inv = updated.txns.find((t) => t.id === id);
    if (inv) {
      inv.st = "paid";
      inv.paidAt = iso();
      updated.outcomes.collected = (updated.outcomes.collected || 0) + (inv.amt || 0);
      (updated.workflows || []).forEach((wf) => {
        if (wf.targetId === id && wf.status === "active") {
          wf.status = "completed";
          wf.completedAt = iso();
          wf.outcome = "payment_received";
        }
      });
    }
    onUpdate(updated);
  }

  const statusPill = (t) => {
    if (t.st === "paid") return <Pill label="Paid" variant="green" />;
    if (t.st === "escalated") return <Pill label="Escalated" variant="red" />;
    const overdue = t.due && new Date(t.due) < new Date();
    return overdue ? <Pill label={`${da(t.due)}d overdue`} variant="red" /> : <Pill label="Pending" variant="amber" />;
  };

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Revenue", value: $$(totalRevenue), color: T.gn },
          { label: "Expenses", value: $$(totalExpenses), color: T.rd },
          { label: "Outstanding", value: $$(totalOutstanding), color: T.am },
          { label: "Overdue", value: $$(totalOverdue), color: T.rd },
        ].map((m) => (
          <div key={m.label} style={{ background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.dm }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["invoices", "Invoices"], ["income", "Income"], ["expenses", "Expenses"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: tab === key ? T.bl : T.bd,
              color: tab === key ? "#fff" : T.dm,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setShowForm(true)}>+ Add</Button>
      </div>

      {/* List */}
      <Card>
        {tab === "invoices" && invoices.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No invoices yet.</p>}
        {tab === "income" && income.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No income records yet.</p>}
        {tab === "expenses" && expenses.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No expense records yet.</p>}
        {(tab === "invoices" ? invoices : tab === "income" ? income : expenses).map((t) => (
          <Row key={t.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{t.desc}</div>
              <div style={{ fontSize: 11, color: T.mt }}>
                {sd(t.at)} {t.due && `· Due ${sd(t.due)}`}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{$$(t.amt)}</div>
            {tab === "invoices" && statusPill(t)}
            {tab === "invoices" && t.st === "pending" && (
              <Button size="sm" variant="success" onClick={() => markPaid(t.id)}>Mark Paid</Button>
            )}
          </Row>
        ))}
      </Card>

      {/* Add dialog */}
      {showForm && (
        <Dialog title="Add Financial Record" onClose={() => setShowForm(false)} onConfirm={saveRecord} confirmLabel="Save">
          <Select
            label="Type"
            value={form.type}
            onChange={set("type")}
            options={[{ value: "inv", label: "Invoice (Receivable)" }, { value: "inc", label: "Income" }, { value: "exp", label: "Expense" }]}
          />
          <Input label="Description" value={form.desc} onChange={set("desc")} placeholder="Invoice #1001 - Website project" />
          <Input label="Amount ($)" type="number" value={form.amt} onChange={set("amt")} placeholder="5000" />
          {form.type === "inv" && <Input label="Due Date" type="date" value={form.due} onChange={set("due")} />}
          {form.type === "inv" && <Input label="Client Email" type="email" value={form.email} onChange={set("email")} placeholder="client@example.com" />}
        </Dialog>
      )}
    </div>
  );
}
