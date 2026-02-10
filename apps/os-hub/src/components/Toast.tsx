"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./Toast.module.css";

type ToastType = "success" | "error" | "info";

interface ToastData {
  id: number;
  type: ToastType;
  message: string;
}

let toastId = 0;
let addToastFn: ((toast: Omit<ToastData, "id">) => void) | null = null;

export function showToast(toast: { type: ToastType; message: string }) {
  addToastFn?.(toast);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, "id">) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { ...toast, id }]);

    if (toast.type !== "error") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]}`}
        >
          <span className={styles.message}>{toast.message}</span>
          <button
            className={styles.close}
            onClick={() => dismiss(toast.id)}
            aria-label="close"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
