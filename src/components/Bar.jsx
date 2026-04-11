import { T } from "../lib/theme.js";

export default function Bar({ value, max = 100, color }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const barColor = color || (pct >= 70 ? T.gn : pct >= 40 ? T.am : T.rd);
  return (
    <div style={{ background: T.bd, borderRadius: 4, height: 6, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}
