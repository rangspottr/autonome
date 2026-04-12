import styles from "./Stat.module.css";

export default function Stat({ label, value, sub, color, trend, trendValue }) {
  const colorClass = color ? styles[`color${color.charAt(0).toUpperCase() + color.slice(1)}`] : "";
  const trendClass = trend === "up" ? styles.trendUp : trend === "down" ? styles.trendDown : styles.trendNeutral;
  return (
    <div className={`${styles.stat} ${colorClass}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
      {trendValue !== undefined && (
        <div className={`${styles.trend} ${trendClass}`}>
          <span aria-hidden="true">{trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}</span>
          {trendValue}
        </div>
      )}
    </div>
  );
}
