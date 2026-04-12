import { useState, useEffect } from "react";
import { T } from "../lib/theme.js";
import { api } from "../lib/api.js";
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

export default function KnowledgeView() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: "", category: "Policies", content: "" });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function fetchArticles() {
    try {
      setError(null);
      const data = await api.get("/knowledge");
      setArticles(data);
    } catch (err) {
      setError(err.message || "Failed to load articles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchArticles();
  }, []);

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

  async function saveArticle() {
    try {
      setError(null);
      if (editId) {
        await api.patch(`/knowledge/${editId}`, { title: form.title, content: form.content, category: form.category });
      } else {
        await api.post("/knowledge", { title: form.title, content: form.content, category: form.category });
      }
      setShowForm(false);
      await fetchArticles();
    } catch (err) {
      setError(err.message || "Failed to save article");
    }
  }

  async function deleteArticle(id) {
    if (!window.confirm("Delete this article?")) return;
    try {
      setError(null);
      await api.delete(`/knowledge/${id}`);
      await fetchArticles();
    } catch (err) {
      setError(err.message || "Failed to delete article");
    }
  }

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Knowledge Base</h2>
          <div style={{ fontSize: 13, color: T.dm }}>
            Articles here are included as context in AI queries. Keep them accurate and up-to-date.
          </div>
        </div>
        <Card>
          <p style={{ color: T.mt, fontSize: 13, textAlign: "center", padding: 24 }}>Loading articles…</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: T.tx }}>Knowledge Base</h2>
        <div style={{ fontSize: 13, color: T.dm }}>
          Articles here are included as context in AI queries. Keep them accurate and up-to-date.
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

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
                  Updated {new Date(article.updated_at || article.created_at).toLocaleDateString()}
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
