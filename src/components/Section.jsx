export default function Section({ title, action, children, style }) {
  return (
    <div style={{ marginBottom: "var(--space-6)", ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          {title && <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700, color: "var(--color-text-primary)" }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
