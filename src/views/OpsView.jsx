import { useState, useEffect, useCallback } from "react";
import { T } from "../lib/theme.js";
import { sd } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Row from "../components/Row.jsx";

const PRIORITY_COLORS = { low: "muted", normal: "blue", high: "amber", urgent: "red" };
const STATUS_COLORS = { pending: "muted", in_progress: "blue", done: "green", blocked: "red" };
const STATUS_LABELS = { pending: "Todo", in_progress: "In Progress", done: "Done", blocked: "Blocked" };

export default function OpsView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ title: "", description: "", priority: "normal", due_date: "", assigned_to: "" });

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const data = await api.get("/tasks");
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function saveTask() {
    try {
      setError(null);
      await api.post("/tasks", {
        title: form.title,
        description: form.description,
        priority: form.priority,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
        status: "pending",
      });
      setShowForm(false);
      setForm({ title: "", description: "", priority: "normal", due_date: "", assigned_to: "" });
      await fetchTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateStatus(id, status) {
    try {
      setError(null);
      await api.patch(`/tasks/${id}`, { status });
      await fetchTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  const overdue = tasks.filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date());
  const done = tasks.filter((t) => t.status === "done");

  if (loading) return <p style={{ color: T.mt, fontSize: 13 }}>Loading tasks…</p>;

  return (
    <div>
      {error && (
        <div style={{ background: "#fef2f2", border: `1px solid ${T.rd}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.rd }}>
          {error}
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Tasks", value: tasks.length, color: T.bl },
          { label: "Overdue", value: overdue.length, color: T.rd },
          { label: "In Progress", value: tasks.filter((t) => t.status === "in_progress").length, color: T.am },
          { label: "Completed", value: done.length, color: T.gn },
        ].map((m) => (
          <div key={m.label} style={{ background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.dm }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + Add */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["all", "All"], ["pending", "Todo"], ["in_progress", "In Progress"], ["done", "Done"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: filter === key ? T.bl : T.bd, color: filter === key ? "#fff" : T.dm, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setShowForm(true)}>+ Add Task</Button>
      </div>

      <Card>
        {filtered.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No tasks.</p>}
        {filtered.map((task) => {
          const isOverdue = task.status !== "done" && task.due_date && new Date(task.due_date) < new Date();
          return (
            <Row key={task.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, textDecoration: task.status === "done" ? "line-through" : "none" }}>
                  {task.title}
                </div>
                <div style={{ fontSize: 11, color: isOverdue ? T.rd : T.mt }}>
                  {task.due_date ? `Due ${sd(task.due_date)}${isOverdue ? " (overdue)" : ""}` : "No due date"}
                </div>
              </div>
              <Pill label={task.priority || "normal"} variant={PRIORITY_COLORS[task.priority] || "muted"} />
              <Pill label={STATUS_LABELS[task.status] || task.status} variant={STATUS_COLORS[task.status] || "muted"} />
              {task.status !== "done" && (
                <Select
                  value={task.status}
                  onChange={(v) => updateStatus(task.id, v)}
                  options={[
                    { value: "pending", label: "Todo" },
                    { value: "in_progress", label: "In Progress" },
                    { value: "done", label: "Done" },
                    { value: "blocked", label: "Blocked" },
                  ]}
                  style={{ marginBottom: 0, minWidth: 120 }}
                />
              )}
            </Row>
          );
        })}
      </Card>

      {showForm && (
        <Dialog title="Add Task" onClose={() => setShowForm(false)} onConfirm={saveTask} confirmLabel="Add Task">
          <Input label="Task Title" value={form.title} onChange={set("title")} placeholder="Follow up on proposal" />
          <Input label="Description" value={form.description} onChange={set("description")} placeholder="Optional details..." />
          <div style={{ display: "flex", gap: 8 }}>
            <Select label="Priority" value={form.priority} onChange={set("priority")} options={["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} style={{ flex: 1 }} />
            <Input label="Due Date" type="date" value={form.due_date} onChange={set("due_date")} style={{ flex: 1 }} />
          </div>
          <Input label="Assignee" value={form.assigned_to} onChange={set("assigned_to")} placeholder="Team member name" />
        </Dialog>
      )}
    </div>
  );
}
