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

const TYPE_MAP = { inv: "invoice", inc: "income", exp: "expense" };

export default function FinanceView() {
  const [tab, setTab] = useState("invoices");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ desc: "", amt: "", due: "", email: "", type: "inv" });
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get("/invoices");
      setAllInvoices(data);
    } catch (err) {
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const invoices = allInvoices.filter((t) => (t.metadata?.type || "invoice") === "invoice");
  const income = allInvoices.filter((t) => t.metadata?.type === "income");
  const expenses = allInvoices.filter((t) => t.metadata?.type === "expense");

  const totalRevenue = income.reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, t) => s + (t.amount || 0), 0);
  const totalOutstanding = invoices
    .filter((t) => t.status === "pending")
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalOverdue = invoices
    .filter((t) => t.status === "pending" && t.due_date && new Date(t.due_date) < new Date())
    .reduce((s, t) => s + (t.amount || 0), 0);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function saveRecord() {
    setSaving(true);
    try {
      const metaType = TYPE_MAP[form.type] || "invoice";
      const body = {
        description: form.desc,
        amount: Number(form.amt) || 0,
        status: form.type === "inv" ? "pending" : "paid",
        due_date: form.type === "inv" && form.due ? form.due : null,
        issued_date: new Date().toISOString(),
        metadata: {
          type: metaType,
          ...(form.type === "inv" && form.email ? { client_email: form.email } : {}),
        },
      };
      await api.post("/invoices", body);
      setShowForm(false);
      setForm({ desc: "", amt: "", due: "", email: "", type: "inv" });
      await fetchInvoices();
    } catch (err) {
      setError(err.message || "Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(id) {
    try {
      await api.patch(`/invoices/${id}`, { status: "paid" });
      await fetchInvoices();
    } catch (err) {
      setError(err.message || "Failed to update invoice");
    }
  }

  const statusPill = (t) => {
    if (t.status === "paid") return <Pill label="Paid" variant="green" />;
    if (t.status === "cancelled") return <Pill label="Cancelled" variant="red" />;
    if (t.status === "overdue") return <Pill label="Overdue" variant="red" />;
    const overdue = t.due_date && new Date(t.due_date) < new Date();
    return overdue ? <Pill label={`${da(t.due_date)}d overdue`} variant="red" /> : <Pill label="Pending" variant="amber" />;
  };

  if (loading) {
    return <p style={{ color: T.mt, fontSize: 13 }}>Loading financial data…</p>;
  }

  return (
    <div>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", marginBottom: 12, color: "#dc2626", fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

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
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{t.description}</div>
              <div style={{ fontSize: 11, color: T.mt }}>
                {sd(t.issued_date || t.created_at)} {t.due_date && `· Due ${sd(t.due_date)}`}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.tx }}>{$$(t.amount)}</div>
            {tab === "invoices" && statusPill(t)}
            {tab === "invoices" && t.status === "pending" && (
              <Button size="sm" variant="success" onClick={() => markPaid(t.id)}>Mark Paid</Button>
            )}
          </Row>
        ))}
      </Card>

      {/* Add dialog */}
      {showForm && (
        <Dialog title="Add Financial Record" onClose={() => setShowForm(false)} onConfirm={saveRecord} confirmLabel={saving ? "Saving…" : "Save"}>
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
