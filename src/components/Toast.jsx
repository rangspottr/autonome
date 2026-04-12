import { useState, useCallback, createContext, useContext } from "react";
import styles from "./Toast.module.css";

const ICONS = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

let _toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", title) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.type] || styles.info}`} role="alert">
            <span className={styles.icon} aria-hidden="true">{ICONS[t.type] || "ℹ"}</span>
            <div className={styles.body}>
              {t.title && <div className={styles.title}>{t.title}</div>}
              <div className={styles.msg}>{t.message}</div>
            </div>
            <button className={styles.closeBtn} onClick={() => removeToast(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
