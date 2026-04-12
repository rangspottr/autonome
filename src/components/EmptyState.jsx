import styles from "./EmptyState.module.css";

export default function EmptyState({ icon = "○", title, description, action }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.icon} aria-hidden="true">{icon}</div>
      {title && <div className={styles.title}>{title}</div>}
      {description && <div className={styles.desc}>{description}</div>}
      {action}
    </div>
  );
}
