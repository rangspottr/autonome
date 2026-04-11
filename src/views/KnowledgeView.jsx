import { useState } from "react";
import { T } from "../lib/theme.js";
import { uid, iso } from "../lib/utils.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Dialog from "../components/Dialog.jsx";
import Pill from "../components/Pill.jsx";

const CATEGORIES = ["Policies", "Pricing", "Objection Handling", "Troubleshooting", "SOPs", "Product Info"];
const CAT_COLORS = {
  Policies: "blue",
  Pricing: "green",
  "Objection Handling": "purple",
  Troubleshooting: "amber",
  SOPs: "muted",
  "Product Info": "blue",
};

export default function KnowledgeView({ db, onUpdate }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: "", category: "Policies", content: "" });

  const articles = db.knowledge || [];
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = articles
    .filter((a) => filterCat === "All" || a.category === filterCat)
    .filter((a) =>
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.content.toLowerCase().includes(search.toLowerCase())
    );

  function openNew() {
    setForm({ title: "", category: "Policies", content: "" });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(article) {
    setForm({ title: article.title, category: article.category, content: article.content });
    setEditId(article.id);
    setShowForm(true);
  }

  function saveArticle() {
    const updated = JSON.parse(JSON.stringify(db));
    if (editId) {
      const idx = updated.knowledge.findIndex((a) => a.id === editId);
      if (idx !== -1) {
        updated.knowledge[idx] = { ...updated.knowledge[idx], ...form, updatedAt: iso() };
      }
    } else {
      updated.knowledge = [
        ...(updated.knowledge || []),
        { id: uid(), ...form, createdAt: iso(), updatedAt: iso() },
      ];
    }
    onUpdate(updated);
    setShowForm(false);
  }

  function deleteArticle(id) {
    if (!window.confirm("Delete this article?")) return;
    const updated = JSON.parse(JSON.stringify(db));
    updated.knowledge = updated.knowledge.filter((a) => a.id !== id);
    onUpdate(updated);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Knowledge Base</h2>
        <div style={{ fontSize: 13, color: T.dm }}>
          Articles here are included as context in AI queries. Keep them accurate and up-to-date.
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <Input
          label=""
          value={search}
          onChange={setSearch}
          placeholder="Search articles..."
          style={{ flex: 1, marginBottom: 0 }}
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${T.bd}`, borderRadius: 8, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: T.tx, background: T.wh, cursor: "pointer" }}
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button size="sm" onClick={openNew}>+ New Article</Button>
      </div>

      {/* Articles */}
      {filtered.length === 0 ? (
        <Card>
          <p style={{ color: T.mt, fontSize: 13, textAlign: "center", padding: 24 }}>
            {search || filterCat !== "All" ? "No articles match your search." : "No articles yet. Add your first knowledge base article."}
          </p>
        </Card>
      ) : (
        filtered.map((article) => (
          <Card key={article.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.tx }}>{article.title}</div>
                  <Pill label={article.category} variant={CAT_COLORS[article.category] || "muted"} />
                </div>
                <div style={{ fontSize: 13, color: T.dm, lineHeight: 1.5, marginBottom: 4 }}>
                  {article.content.length > 200 ? article.content.slice(0, 200) + "…" : article.content}
                </div>
                <div style={{ fontSize: 11, color: T.mt }}>
                  Updated {new Date(article.updatedAt || article.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Button size="sm" variant="secondary" onClick={() => openEdit(article)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteArticle(article.id)}>Del</Button>
              </div>
            </div>
          </Card>
        ))
      )}

      {/* Article Form Dialog */}
      {showForm && (
        <Dialog
          title={editId ? "Edit Article" : "New Article"}
          onClose={() => setShowForm(false)}
          onConfirm={saveArticle}
          confirmLabel={editId ? "Save Changes" : "Create Article"}
        >
          <Input label="Title" value={form.title} onChange={set("title")} placeholder="Article title" />
          <Select
            label="Category"
            value={form.category}
            onChange={set("category")}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.dm, marginBottom: 4 }}>
              Content
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Article content..."
              rows={8}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: `1px solid ${T.bd}`,
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: T.tx,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
