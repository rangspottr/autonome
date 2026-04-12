import styles from "./Select.module.css";

export default function Select({ label, value, onChange, options, style, disabled, error }) {
  return (
    <div className={styles.wrapper} style={style}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.selectWrap}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={error ? "true" : undefined}
          className={styles.select}
        >
          {options.map((opt) =>
            typeof opt === "string" ? (
              <option key={opt} value={opt}>{opt}</option>
            ) : (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            )
          )}
        </select>
        <span className={styles.chevron} aria-hidden="true">▼</span>
      </div>
      {error && <span className={styles.errorMsg} role="alert">{error}</span>}
    </div>
  );
}
