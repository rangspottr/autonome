import styles from "./StatusDot.module.css";

export default function StatusDot({ status = "muted", label }) {
  const colorMap = {
    active: "success", success: "success", paid: "success", completed: "success", done: "success",
    pending: "warning", overdue: "danger", failed: "danger", cancelled: "danger",
    inactive: "muted", muted: "muted",
    info: "info", brand: "brand", blue: "brand",
    purple: "purple",
  };
  const cls = colorMap[status] || "muted";
  return (
    <span className={`${styles.dot} ${styles[cls]}`}>
      <span className={styles.circle} aria-hidden="true" />
      {label || status}
    </span>
  );
}
