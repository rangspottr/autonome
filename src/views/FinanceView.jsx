import { useState, useEffect, useCallback } from "react";
import { $$, sd, da } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Stat from "../components/Stat.jsx";
import Table from "../components/Table.jsx";
import Tabs from "../components/Tabs.jsx";
import StatusDot from "../components/StatusDot.jsx";
import styles from "./FinanceView.module.css";

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

  function getStatus(row) {
    if (row.status === "paid") return "paid";
    if (row.status === "cancelled") return "cancelled";
    if (row.status === "overdue") return "overdue";
    if (row.due_date && new Date(row.due_date) < new Date()) return "overdue";
    return "pending";
  }

  const activeData = tab === "invoices" ? invoices : tab === "income" ? income : expenses;

  const invoiceColumns = [
    { key: "description", label: "Description" },
    {
      key: "amount", label: "Amount", align: "right",
      render: (v) => <strong>{$$(v)}</strong>,
    },
    {
      key: "status", label: "Status",
      render: (v, row) => {
        const s = getStatus(row);
        return <StatusDot status={s} label={s === "overdue" ? `${da(row.due_date)}d overdue` : s.charAt(0).toUpperCase() + s.slice(1)} />;
      },
    },
    {
      key: "due_date", label: "Due Date", sortable: true,
      render: (v) => v ? sd(v) : "—",
    },
    {
      key: "issued_date", label: "Issued",
      render: (v, row) => sd(v || row.created_at),
    },
    {
      key: "_actions", label: "",
      render: (_, row) => row.status === "pending" ? (
        <Button size="sm" variant="success" onClick={() => markPaid(row.id)}>Mark Paid</Button>
      ) : null,
    },
  ];

  const simpleColumns = [
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount", align: "right", render: (v) => $$(v) },
    { key: "issued_date", label: "Date", sortable: true, render: (v, row) => sd(v || row.created_at) },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Finance</h2>
        <Button size="sm" onClick={() => setShowForm(true)}>+ Add Record</Button>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button className={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className={styles.statsGrid}>
        <Stat label="Revenue" value={$$(totalRevenue)} color="success" />
        <Stat label="Expenses" value={$$(totalExpenses)} color="danger" />
        <Stat label="Outstanding" value={$$(totalOutstanding)} color="warning" />
        <Stat label="Overdue" value={$$(totalOverdue)} color="danger" />
      </div>

      <Tabs
        tabs={[
          { id: "invoices", label: "Invoices", badge: invoices.length },
          { id: "income", label: "Income", badge: income.length },
          { id: "expenses", label: "Expenses", badge: expenses.length },
        ]}
        active={tab}
        onChange={setTab}
      >
        <Table
          columns={tab === "invoices" ? invoiceColumns : simpleColumns}
          data={activeData}
          loading={loading}
          emptyIcon="—"
          emptyTitle={`No ${tab} yet`}
          emptyDescription="Your Finance agent monitors all financial activity here. Add a record or connect your payment provider to start tracking."
          emptyAction={<Button size="sm" onClick={() => setShowForm(true)}>+ Add Record</Button>}
        />
      </Tabs>

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
