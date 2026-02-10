import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  message: string;
  detail?: string;
}

export default function EmptyState({ message, detail }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.message}>{message}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
    </div>
  );
}
