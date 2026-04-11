import { T } from "../lib/theme.js";

const VARIANTS = {
  primary: { background: T.bl, color: "#fff", border: "none" },
  secondary: { background: T.wh, color: T.tx, border: `1px solid ${T.bd}` },
  danger: { background: T.rd, color: "#fff", border: "none" },
  ghost: { background: "transparent", color: T.dm, border: "none" },
  success: { background: T.gn, color: "#fff", border: "none" },
};

export default function Button({ children, onClick, variant = "primary", disabled, style, size = "md" }) {
  const vs = VARIANTS[variant] || VARIANTS.primary;
  const padding = size === "sm" ? "4px 10px" : size === "lg" ? "12px 24px" : "7px 16px";
  const fontSize = size === "sm" ? 12 : size === "lg" ? 15 : 13;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...vs,
        padding,
        fontSize,
        fontWeight: 600,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
