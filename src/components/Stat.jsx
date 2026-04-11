import { T } from "../lib/theme.js";

export default function Stat({ label, value, sub, color }) {
  return (
    <div style={{ textAlign: "center", minWidth: 100 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || T.tx }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.mt, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.mt }}>{sub}</div>}
    </div>
  );
}
