import styles from "./Bar.module.css";

export default function Bar({ value, max = 100, color }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const colorClass = color ? styles[color] : pct >= 70 ? styles.success : pct >= 40 ? styles.warning : styles.danger;
  return (
    <div className={styles.track}>
      <div className={`${styles.fill} ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
