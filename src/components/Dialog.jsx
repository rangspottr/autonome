import { useEffect, useRef } from "react";
import Button from "./Button.jsx";
import styles from "./Dialog.module.css";

export default function Dialog({ title, children, onClose, onConfirm, confirmLabel = "Confirm", confirmVariant = "primary", size = "md" }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const firstFocusable = panelRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
  }, []);

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles[size] || styles.md}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="dialog-title" className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <div className={styles.body}>{children}</div>
        {onConfirm && (
          <div className={styles.footer}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
