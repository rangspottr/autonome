import styles from "./Avatar.module.css";

const COLORS = ["#2563EB","#059669","#D97706","#7C3AED","#0891B2","#DC2626","#EA580C"];

function colorFromName(name) {
  if (!name) return COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ name, size = "md" }) {
  const initials = name
    ? name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";
  return (
    <span
      className={`${styles.avatar} ${styles[size] || styles.md}`}
      style={{ background: colorFromName(name) }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
