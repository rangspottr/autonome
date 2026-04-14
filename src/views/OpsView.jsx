import { useState, useEffect, useCallback } from "react";
import { sd } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Stat from "../components/Stat.jsx";
import Table from "../components/Table.jsx";
import Tabs from "../components/Tabs.jsx";
import styles from "./OpsView.module.css";

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

  const columns = [
    {
      key: "title", label: "Task",
      render: (v, row) => {
        const isOverdue = row.status !== "done" && row.due_date && new Date(row.due_date) < new Date();
        return (
          <div>
            <div className={`${styles.taskTitle} ${row.status === "done" ? styles.taskTitleDone : ""}`}>{v}</div>
            <div className={`${styles.taskMeta} ${isOverdue ? styles.taskMetaOverdue : ""}`}>
              {row.due_date ? `Due ${sd(row.due_date)}${isOverdue ? " (overdue)" : ""}` : "No due date"}
            </div>
          </div>
        );
      },
    },
    {
      key: "priority", label: "Priority",
      render: (v) => <Pill label={v || "normal"} variant={PRIORITY_COLORS[v] || "muted"} />,
    },
    {
      key: "status", label: "Status",
      render: (v) => <Pill label={STATUS_LABELS[v] || v} variant={STATUS_COLORS[v] || "muted"} />,
    },
    {
      key: "_actions", label: "",
      render: (_, row) => row.status !== "done" ? (
        <div className={styles.rowActions}>
          <Select
            value={row.status}
            onChange={(v) => updateStatus(row.id, v)}
            options={[
              { value: "pending", label: "Todo" },
              { value: "in_progress", label: "In Progress" },
              { value: "done", label: "Done" },
              { value: "blocked", label: "Blocked" },
            ]}
            style={{ marginBottom: 0, minWidth: 120 }}
          />
        </div>
      ) : null,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Operations</h2>
        <Button size="sm" onClick={() => setShowForm(true)}>+ Add Task</Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.statsGrid}>
        <Stat label="Total Tasks" value={tasks.length} color="brand" />
        <Stat label="Overdue" value={overdue.length} color="danger" />
        <Stat label="In Progress" value={tasks.filter((t) => t.status === "in_progress").length} color="warning" />
        <Stat label="Completed" value={done.length} color="success" />
      </div>

      <Tabs
        tabs={[
          { id: "all", label: "All", badge: tasks.length },
          { id: "pending", label: "Todo" },
          { id: "in_progress", label: "In Progress" },
          { id: "done", label: "Done" },
        ]}
        active={filter}
        onChange={setFilter}
      >
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          emptyIcon="○"
          emptyTitle="No tasks tracked yet"
          emptyDescription="Tasks appear here as they're created — by you or by agents detecting work that needs attention."
          emptyAction={<Button size="sm" onClick={() => setShowForm(true)}>+ Add Task</Button>}
        />
      </Tabs>

      {showForm && (
        <Dialog title="Add Task" onClose={() => setShowForm(false)} onConfirm={saveTask} confirmLabel="Add Task">
          <Input label="Task Title" value={form.title} onChange={set("title")} placeholder="Follow up on proposal" />
          <Input label="Description" value={form.description} onChange={set("description")} placeholder="Optional details..." />
          <div className={styles.formRow}>
            <Select label="Priority" value={form.priority} onChange={set("priority")} options={["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} style={{ flex: 1 }} />
            <Input label="Due Date" type="date" value={form.due_date} onChange={set("due_date")} style={{ flex: 1 }} />
          </div>
          <Input label="Assignee" value={form.assigned_to} onChange={set("assigned_to")} placeholder="Team member name" />
        </Dialog>
      )}
    </div>
  );
}
