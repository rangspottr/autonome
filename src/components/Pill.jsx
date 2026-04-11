import { T } from "../lib/theme.js";

const COLORS = {
  blue: { bg: T.blL, color: T.bl },
  green: { bg: T.gnL, color: T.gn },
  red: { bg: T.rdL, color: T.rd },
  amber: { bg: T.amL, color: T.am },
  purple: { bg: T.puL, color: T.pu },
  muted: { bg: "#F1F3F5", color: T.dm },
};

export default function Pill({ label, variant = "blue" }) {
  const { bg, color } = COLORS[variant] || COLORS.blue;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}
