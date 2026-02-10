import styles from "./Card.module.css";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div className={`${styles.card} ${className ?? ""}`}>
      {children}
    </div>
  );
}
