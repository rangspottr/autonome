import { T } from "../lib/theme.js";

export default function Section({ title, action, children, style }) {
  return (
    <div style={{ marginBottom: 24, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {title && <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.tx }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
