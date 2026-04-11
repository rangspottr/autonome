import { T } from "../lib/theme.js";

const BASE = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  background: T.wh,
  border: `1px solid ${T.bd}`,
  borderRadius: 12,
  padding: "16px 20px",
  marginBottom: 12,
};

export default function Card({ children, style }) {
  return <div style={{ ...BASE, ...style }}>{children}</div>;
}
