import AgentMeta from "./AgentMeta.js";
import styles from "./EmptyState.module.css";

export default function EmptyState({ icon = "○", title, description, action, quickActions, agent, statusIndicator = false }) {
  const agentMeta = agent ? AgentMeta[agent] : null;
  const iconColor = agentMeta ? agentMeta.color : undefined;
  const iconBg = agentMeta ? agentMeta.bg : undefined;
  const agentContext = agentMeta ? agentMeta.monitoringStatement : null;
  const watchesFor = agentMeta ? agentMeta.watchesFor : null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.iconWrapper}>
        <div
          className={styles.icon}
          aria-hidden="true"
          style={agentMeta ? { color: iconColor, background: iconBg, borderRadius: "var(--radius-md)", padding: "var(--space-2)" } : undefined}
        >
          {icon}
        </div>
        {statusIndicator && <span className={styles.pulseDot} aria-label="Agent is actively monitoring" />}
      </div>
      {title && <div className={styles.title}>{title}</div>}
      {description && <div className={styles.desc}>{description}</div>}
      {agentContext && <div className={styles.agentContext}>{agentContext}</div>}
      {watchesFor && watchesFor.length > 0 && (
        <ul className={styles.watchList} aria-label="Agent monitors">
          {watchesFor.map((item) => (
            <li key={item} className={styles.watchItem}>{item}</li>
          ))}
        </ul>
      )}
      {action}
      {quickActions && <div className={styles.quickActions}>{quickActions}</div>}
    </div>
  );
}
