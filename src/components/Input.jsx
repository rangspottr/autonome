import styles from "./Input.module.css";

export default function Input({ label, value, onChange, type = "text", placeholder, style, required, disabled, error, hint, id, name }) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.wrapper} style={style}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
        </label>
      )}
      <div className={styles.inputWrap}>
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={`${styles.input} ${error ? styles.inputError : ""}`}
        />
      </div>
      {error && <span id={errorId} className={styles.errorMsg} role="alert">{error}</span>}
      {hint && !error && <span id={hintId} className={styles.hint}>{hint}</span>}
    </div>
  );
}
