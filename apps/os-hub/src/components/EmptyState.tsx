import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  message: string;
  detail?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ message, detail, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.message}>{message}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
