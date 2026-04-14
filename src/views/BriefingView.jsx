import BusinessBriefing from "../components/BusinessBriefing.jsx";
import styles from "./BriefingView.module.css";

export default function BriefingView() {
  return (
    <div className={styles.view}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Your Briefing</h2>
        <p className={styles.pageDesc}>Here&apos;s what your AI team found.</p>
      </div>
      <BusinessBriefing />
    </div>
  );
}
