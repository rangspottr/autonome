import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Dialog from "../components/Dialog.jsx";
import Pill from "../components/Pill.jsx";
import Table from "../components/Table.jsx";
import styles from "./KnowledgeView.module.css";

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

  const columns = [
    {
      key: "title", label: "Article",
      render: (v, row) => (
        <div>
          <div className={styles.articleTitle}>{v}</div>
          <div className={styles.articleContent}>
            {row.content.length > 160 ? row.content.slice(0, 160) + "…" : row.content}
          </div>
          <div className={styles.articlePills}>
            <Pill label={row.category} variant={CAT_COLORS[row.category] || "muted"} />
          </div>
        </div>
      ),
    },
    {
      key: "updated_at", label: "Updated", sortable: true,
      render: (v, row) => new Date(v || row.created_at).toLocaleDateString(),
    },
    {
      key: "_actions", label: "",
      render: (_, row) => (
        <div className={styles.rowActions}>
          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => deleteArticle(row.id)}>Del</Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Knowledge Base</h2>
          <div className={styles.pageSubtitle}>
            Articles here are included as context in AI queries. Keep them accurate and up-to-date.
          </div>
        </div>
        <Button size="sm" onClick={openNew}>+ New Article</Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.filterRow}>
        <Input
          label=""
          value={search}
          onChange={setSearch}
          placeholder="Search articles..."
          style={{ marginBottom: 0, flex: 1 }}
        />
        <select
          className={styles.catFilter}
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <Card>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          emptyIcon="📚"
          emptyTitle="No articles found"
          emptyDescription={search || filterCat !== "All" ? "No articles match your search." : "Add your first knowledge base article."}
          emptyAction={!search && filterCat === "All" ? <Button size="sm" onClick={openNew}>+ New Article</Button> : undefined}
        />
      </Card>

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
          <div>
            <label className={styles.contentLabel}>Content</label>
            <textarea
              className={styles.textarea}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Article content..."
              rows={8}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
