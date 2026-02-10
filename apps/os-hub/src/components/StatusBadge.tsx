import styles from "./StatusBadge.module.css";

type BadgeVariant = "published" | "draft" | "pending" | "error";

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
}

export default function StatusBadge({ label, variant }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      {label}
    </span>
  );
}
