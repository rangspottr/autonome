import styles from "./Pill.module.css";

export default function Pill({ label, variant = "blue", size = "md", dot = false }) {
  const cls = [
    styles.pill,
    styles[variant] || styles.blue,
    size === "sm" ? styles.sm : styles.md,
  ].join(" ");

  return (
    <span className={cls}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {label}
    </span>
  );
}
