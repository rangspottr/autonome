import { T } from "../lib/theme.js";

export default function Row({ children, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: `1px solid ${T.bd}`,
        gap: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
