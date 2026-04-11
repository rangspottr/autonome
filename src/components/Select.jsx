import { T } from "../lib/theme.js";

export default function Select({ label, value, onChange, options, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      {label && (
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.dm, marginBottom: 4 }}>
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: `1px solid ${T.bd}`,
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          color: T.tx,
          background: T.wh,
          outline: "none",
          boxSizing: "border-box",
        }}
      >
        {options.map((opt) =>
          typeof opt === "string" ? (
            <option key={opt} value={opt}>{opt}</option>
          ) : (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          )
        )}
      </select>
    </div>
  );
}
