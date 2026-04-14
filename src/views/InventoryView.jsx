import { useState, useEffect } from "react";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Bar from "../components/Bar.jsx";
import Stat from "../components/Stat.jsx";
import EmptyState from "../components/EmptyState.jsx";
import styles from "./InventoryView.module.css";

export default function InventoryView() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", qty: "", rp: "", val: "", sku: "", location: "" });

  async function fetchAssets() {
    try {
      setError(null);
      const data = await api.get("/assets");
      setAssets(data);
    } catch (err) {
      setError(err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAssets(); }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function saveAsset() {
    try {
      await api.post("/assets", {
        name: form.name,
        quantity: Number(form.qty) || 0,
        unit_cost: Number(form.val) || 0,
        location: form.location,
        metadata: {
          reorder_point: Number(form.rp) || 0,
          sku: form.sku,
        },
      });
      setShowForm(false);
      setForm({ name: "", qty: "", rp: "", val: "", sku: "", location: "" });
      await fetchAssets();
    } catch (err) {
      setError(err.message || "Failed to add item");
    }
  }

  async function adjustQty(id, delta) {
    const asset = assets.find((a) => a.id === id);
    if (!asset) return;
    const newQty = Math.max(0, (asset.quantity || 0) + delta);
    try {
      await api.patch(`/assets/${id}`, { quantity: newQty });
      await fetchAssets();
    } catch (err) {
      setError(err.message || "Failed to update quantity");
    }
  }

  const rp = (a) => (a.metadata && a.metadata.reorder_point) || 0;
  const sku = (a) => (a.metadata && a.metadata.sku) || "";

  const lowStock = assets.filter((a) => rp(a) > 0 && (a.quantity || 0) < rp(a));
  const totalValue = assets.reduce((s, a) => s + (a.quantity || 0) * (a.unit_cost || 0), 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Inventory</h2>
        <Button size="sm" onClick={() => setShowForm(true)}>+ Add Item</Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {lowStock.length > 0 && (
        <div className={styles.lowStockBanner}>
          ⚠ {lowStock.length} item{lowStock.length > 1 ? "s" : ""} below reorder point
        </div>
      )}

      <div className={styles.statsGrid}>
        <Stat label="Total Items" value={assets.length} color="brand" />
        <Stat label="Low Stock Alerts" value={lowStock.length} color="danger" />
        <Stat label="Inventory Value" value={$$(totalValue)} color="success" />
      </div>

      {loading ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Loading inventory…</p>
      ) : assets.length === 0 ? (
        <EmptyState
          icon="○"
          title="No inventory tracked yet"
          description="Add items to enable automated reorder monitoring by the Operations agent."
          agent="operations"
          statusIndicator
        />
      ) : (
        assets.map((a) => {
          const aRp = rp(a);
          const aSku = sku(a);
          const isLow = aRp > 0 && (a.quantity || 0) < aRp;
          return (
            <div key={a.id} className={styles.itemRow}>
              <div className={styles.itemRowTop}>
                <div style={{ flex: 1 }}>
                  <div className={styles.itemName}>{a.name}</div>
                  <div className={styles.itemMeta}>
                    {aSku && `SKU: ${aSku} · `}Unit value: {$$(a.unit_cost)}
                    {a.location && ` · ${a.location}`}
                  </div>
                </div>
                {isLow && <Pill label="Low Stock" variant="red" />}
                <div className={styles.qtyControl}>
                  <button className={styles.qtyBtn} onClick={() => adjustQty(a.id, -1)}>−</button>
                  <span className={styles.qtyValue}>{a.quantity}</span>
                  <button className={styles.qtyBtn} onClick={() => adjustQty(a.id, 1)}>+</button>
                </div>
                <div className={styles.rpLabel}>{aRp > 0 && `RP: ${aRp}`}</div>
              </div>
              {aRp > 0 && (
                <div className={styles.barWrap}>
                  <Bar value={a.quantity} max={aRp * 2} color={isLow ? "var(--color-danger)" : "var(--color-success)"} />
                </div>
              )}
            </div>
          );
        })
      )}

      {showForm && (
        <Dialog title="Add Inventory Item" onClose={() => setShowForm(false)} onConfirm={saveAsset} confirmLabel="Add Item">
          <Input label="Item Name" value={form.name} onChange={set("name")} placeholder="Roofing Shingles" />
          <div className={styles.formRow}>
            <Input label="Current Qty" type="number" value={form.qty} onChange={set("qty")} placeholder="100" style={{ flex: 1 }} />
            <Input label="Reorder Point" type="number" value={form.rp} onChange={set("rp")} placeholder="20" style={{ flex: 1 }} />
          </div>
          <div className={styles.formRow}>
            <Input label="Unit Value ($)" type="number" value={form.val} onChange={set("val")} placeholder="25" style={{ flex: 1 }} />
            <Input label="SKU" value={form.sku} onChange={set("sku")} placeholder="SKU-001" style={{ flex: 1 }} />
          </div>
          <Input label="Location" value={form.location} onChange={set("location")} placeholder="Warehouse A" />
        </Dialog>
      )}
    </div>
  );
}
