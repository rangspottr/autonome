import styles from "./Row.module.css";

export default function Row({ children, style }) {
  return (
    <div className={styles.row} style={style}>
      {children}
    </div>
  );
}
