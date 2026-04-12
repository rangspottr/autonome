import styles from "./Skeleton.module.css";

export default function Skeleton({ variant = "text", width, height, style, className = "" }) {
  const variantClass = styles[variant] || styles.text;
  return (
    <span
      className={`${styles.skeleton} ${variantClass} ${className}`}
      style={{ width: width || (variant === "circle" ? height : "100%"), height: height || (variant === "text" ? 14 : variant === "circle" ? 40 : 80), display: "block", ...style }}
      aria-hidden="true"
    />
  );
}
