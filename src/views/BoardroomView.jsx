import Boardroom from "../components/Boardroom.jsx";
import styles from "./BoardroomView.module.css";

export default function BoardroomView() {
  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Boardroom</h2>
        <p className={styles.pageDesc}>
          Bring your entire AI team together. Ask a question and hear from all five specialists at once.
        </p>
      </div>
      <Boardroom />
    </div>
  );
}
