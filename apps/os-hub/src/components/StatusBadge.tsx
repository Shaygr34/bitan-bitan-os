import styles from "./StatusBadge.module.css";

type Status = "uploading" | "processing" | "review" | "completed" | "failed";

const STATUS_LABELS: Record<Status, string> = {
  uploading: "מעלה קבצים",
  processing: "מעבד",
  review: "בבדיקה",
  completed: "הושלם",
  failed: "נכשל",
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status as Status] ?? status;
  const variant = getVariant(status);

  return (
    <span className={`${styles.badge} ${styles[variant]}`}>{label}</span>
  );
}

function getVariant(status: string): string {
  switch (status) {
    case "completed":
      return "success";
    case "review":
      return "warning";
    case "failed":
      return "error";
    case "processing":
      return "info";
    default:
      return "neutral";
  }
}
