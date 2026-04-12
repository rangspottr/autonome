import styles from "./Card.module.css";

export default function Card({ children, style, variant = "default", padding = "md", header, footer, className = "" }) {
  const padClass = padding === "sm" ? styles.padSm : padding === "lg" ? styles.padLg : styles.padMd;
  const cls = [styles.card, styles[variant] || styles.default, padClass, className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style}>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
