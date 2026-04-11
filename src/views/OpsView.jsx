import { useState } from "react";
import { T } from "../lib/theme.js";
import { uid, iso, sd } from "../lib/utils.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Row from "../components/Row.jsx";

const PRIORITY_COLORS = { low: "muted", medium: "blue", high: "amber", urgent: "red" };
const STATUS_COLORS = { todo: "muted", "in-progress": "blue", done: "green", blocked: "red" };

export default function OpsView({ db, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ title: "", desc: "", priority: "medium", due: "", assignee: "" });

  const tasks = db.tasks || [];
  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.st === filter);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function saveTask() {
    const updated = JSON.parse(JSON.stringify(db));
    const task = { id: uid(), ...form, st: "todo", createdAt: iso() };
    updated.tasks = [...(updated.tasks || []), task];
    onUpdate(updated);
    setShowForm(false);
    setForm({ title: "", desc: "", priority: "medium", due: "", assignee: "" });
  }

  function updateStatus(id, status) {
    const updated = JSON.parse(JSON.stringify(db));
    const task = updated.tasks.find((t) => t.id === id);
    if (task) {
      task.st = status;
      if (status === "done") task.completedAt = iso();
    }
    onUpdate(updated);
  }

  const overdue = tasks.filter((t) => t.st !== "done" && t.due && new Date(t.due) < new Date());
  const done = tasks.filter((t) => t.st === "done");

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Tasks", value: tasks.length, color: T.bl },
          { label: "Overdue", value: overdue.length, color: T.rd },
          { label: "In Progress", value: tasks.filter((t) => t.st === "in-progress").length, color: T.am },
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
        {[["all", "All"], ["todo", "Todo"], ["in-progress", "In Progress"], ["done", "Done"]].map(([key, label]) => (
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
          const isOverdue = task.st !== "done" && task.due && new Date(task.due) < new Date();
          return (
            <Row key={task.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, textDecoration: task.st === "done" ? "line-through" : "none" }}>
                  {task.title}
                </div>
                <div style={{ fontSize: 11, color: isOverdue ? T.rd : T.mt }}>
                  {task.due ? `Due ${sd(task.due)}${isOverdue ? " (overdue)" : ""}` : "No due date"}
                </div>
              </div>
              <Pill label={task.priority || "medium"} variant={PRIORITY_COLORS[task.priority] || "muted"} />
              <Pill label={task.st} variant={STATUS_COLORS[task.st] || "muted"} />
              {task.st !== "done" && (
                <Select
                  value={task.st}
                  onChange={(v) => updateStatus(task.id, v)}
                  options={[
                    { value: "todo", label: "Todo" },
                    { value: "in-progress", label: "In Progress" },
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
          <Input label="Description" value={form.desc} onChange={set("desc")} placeholder="Optional details..." />
          <div style={{ display: "flex", gap: 8 }}>
            <Select label="Priority" value={form.priority} onChange={set("priority")} options={["low", "medium", "high", "urgent"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} style={{ flex: 1 }} />
            <Input label="Due Date" type="date" value={form.due} onChange={set("due")} style={{ flex: 1 }} />
          </div>
          <Input label="Assignee" value={form.assignee} onChange={set("assignee")} placeholder="Team member name" />
        </Dialog>
      )}
    </div>
  );
}
