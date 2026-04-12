import styles from "./Tabs.module.css";

export default function Tabs({ tabs, active, onChange, children }) {
  return (
    <div>
      <div className={styles.tabList} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`${styles.tab} ${active === tab.id ? styles.tabActive : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && <span className={styles.badge}>{tab.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className={styles.panel}>
        {children}
      </div>
    </div>
  );
}
