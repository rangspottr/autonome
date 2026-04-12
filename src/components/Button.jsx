import styles from "./Button.module.css";

export default function Button({ children, onClick, variant = "primary", disabled, style, size = "md", loading, icon, type = "button", className = "" }) {
  const cls = [
    styles.btn,
    styles[variant] || styles.primary,
    styles[size] || styles.md,
    loading ? styles.loading : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={style}
      className={cls}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {icon && !loading && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
