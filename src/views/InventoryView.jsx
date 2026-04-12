import { useState, useEffect } from "react";
import { T } from "../lib/theme.js";
import { $$ } from "../lib/utils.js";
import { api } from "../lib/api.js";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Pill from "../components/Pill.jsx";
import Dialog from "../components/Dialog.jsx";
import Input from "../components/Input.jsx";
import Row from "../components/Row.jsx";
import Bar from "../components/Bar.jsx";

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

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: T.mt, fontSize: 13 }}>Loading inventory…</div>;
  }

  if (error && assets.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ color: T.rd, fontSize: 13, marginBottom: 12 }}>{error}</div>
        <Button size="sm" onClick={() => { setLoading(true); fetchAssets(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ background: T.rdL, border: `1px solid ${T.rd}30`, borderRadius: 10, padding: "10px 16px", marginBottom: 16 }}>
          <strong style={{ fontSize: 12, color: T.rd }}>{error}</strong>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Items", value: assets.length, color: T.bl },
          { label: "Low Stock Alerts", value: lowStock.length, color: T.rd },
          { label: "Inventory Value", value: $$(totalValue), color: T.gn },
        ].map((m) => (
          <div key={m.label} style={{ background: T.wh, border: `1px solid ${T.bd}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.dm }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Button size="sm" onClick={() => setShowForm(true)}>+ Add Item</Button>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div style={{ background: T.rdL, border: `1px solid ${T.rd}30`, borderRadius: 10, padding: "10px 16px", marginBottom: 16 }}>
          <strong style={{ fontSize: 12, color: T.rd }}>WARNING: {lowStock.length} item{lowStock.length > 1 ? "s" : ""} below reorder point</strong>
        </div>
      )}

      <Card>
        {assets.length === 0 && <p style={{ color: T.mt, fontSize: 13 }}>No inventory items yet.</p>}
        {assets.map((a) => {
          const aRp = rp(a);
          const aSku = sku(a);
          const isLow = aRp > 0 && (a.quantity || 0) < aRp;
          return (
            <div key={a.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: T.mt }}>
                    {aSku && `SKU: ${aSku} · `}Unit value: {$$(a.unit_cost)}
                    {a.location && ` · ${a.location}`}
                  </div>
                </div>
                {isLow && <Pill label="Low Stock" variant="red" />}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => adjustQty(a.id, -1)} style={{ width: 24, height: 24, borderRadius: 4, border: `1px solid ${T.bd}`, background: T.wh, cursor: "pointer", fontSize: 12 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "center" }}>{a.quantity}</span>
                  <button onClick={() => adjustQty(a.id, 1)} style={{ width: 24, height: 24, borderRadius: 4, border: `1px solid ${T.bd}`, background: T.wh, cursor: "pointer", fontSize: 12 }}>+</button>
                </div>
                <div style={{ fontSize: 12, color: T.mt, minWidth: 60, textAlign: "right" }}>
                  {aRp > 0 && `RP: ${aRp}`}
                </div>
              </div>
              {aRp > 0 && (
                <Bar value={a.quantity} max={aRp * 2} color={isLow ? T.rd : T.gn} />
              )}
            </div>
          );
        })}
      </Card>

      {showForm && (
        <Dialog title="Add Inventory Item" onClose={() => setShowForm(false)} onConfirm={saveAsset} confirmLabel="Add Item">
          <Input label="Item Name" value={form.name} onChange={set("name")} placeholder="Roofing Shingles" />
          <div style={{ display: "flex", gap: 8 }}>
            <Input label="Current Qty" type="number" value={form.qty} onChange={set("qty")} placeholder="100" style={{ flex: 1 }} />
            <Input label="Reorder Point" type="number" value={form.rp} onChange={set("rp")} placeholder="20" style={{ flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Input label="Unit Value ($)" type="number" value={form.val} onChange={set("val")} placeholder="25" style={{ flex: 1 }} />
            <Input label="SKU" value={form.sku} onChange={set("sku")} placeholder="SKU-001" style={{ flex: 1 }} />
          </div>
          <Input label="Location" value={form.location} onChange={set("location")} placeholder="Warehouse A" />
        </Dialog>
      )}
    </div>
  );
}
