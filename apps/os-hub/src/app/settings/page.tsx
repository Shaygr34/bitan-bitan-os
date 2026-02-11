"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { t } from "@/lib/strings";
import { loadSyncPrefs, saveSyncPrefs, clearSyncPrefs } from "@/lib/syncPrefs";
import type { SyncPrefs } from "@/lib/syncPrefs";
import styles from "./page.module.css";

interface ServiceHealth {
  status: "healthy" | "error" | "loading";
  responseMs: number | null;
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<SyncPrefs>({
    defaultYear: new Date().getFullYear(),
    defaultReportType: "financial",
    defaultNotes: "",
  });
  const [syncHealth, setSyncHealth] = useState<ServiceHealth>({
    status: "loading",
    responseMs: null,
  });
  const [factoryHealth, setFactoryHealth] = useState<ServiceHealth>({
    status: "loading",
    responseMs: null,
  });
  const [totalRuns, setTotalRuns] = useState<number | null>(null);
  const [totalArticles, setTotalArticles] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setPrefs(loadSyncPrefs());

    // Ping Sumit Sync API
    const t0 = performance.now();
    fetch("/api/sumit-sync/runs?limit=1")
      .then((res) => {
        const ms = Math.round(performance.now() - t0);
        if (!res.ok) throw new Error("unhealthy");
        return res.json().then((data) => {
          setSyncHealth({ status: "healthy", responseMs: ms });
          // Use full list for count
          fetch("/api/sumit-sync/runs")
            .then((r) => r.json())
            .then((all) => setTotalRuns(Array.isArray(all) ? all.length : 0))
            .catch(() => {});
        });
      })
      .catch(() => {
        setSyncHealth({ status: "error", responseMs: null });
      });

    // Ping Content Factory API
    const t1 = performance.now();
    fetch("/api/content-factory/articles")
      .then((res) => {
        const ms = Math.round(performance.now() - t1);
        if (!res.ok) throw new Error("unhealthy");
        return res.json().then((data) => {
          setFactoryHealth({ status: "healthy", responseMs: ms });
          setTotalArticles(Array.isArray(data) ? data.length : 0);
        });
      })
      .catch(() => {
        setFactoryHealth({ status: "error", responseMs: null });
      });
  }, []);

  function handleSave() {
    saveSyncPrefs(prefs);
    showToast({ type: "success", message: t("settings.saved") });
  }

  function handleClear() {
    clearSyncPrefs();
    setPrefs({
      defaultYear: new Date().getFullYear(),
      defaultReportType: "financial",
      defaultNotes: "",
    });
    setConfirmClear(false);
    showToast({ type: "success", message: "ההעדפות אופסו" });
  }

  return (
    <div>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />

      <div className={styles.sections}>
        {/* Section 1: Sync Preferences */}
        <Card>
          <h2 className={styles.sectionTitle}>העדפות סנכרון</h2>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="defaultYear">שנת מס ברירת מחדל</label>
              <select
                id="defaultYear"
                value={prefs.defaultYear}
                onChange={(e) =>
                  setPrefs({ ...prefs, defaultYear: Number(e.target.value) })
                }
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="defaultType">סוג דוח ברירת מחדל</label>
              <select
                id="defaultType"
                value={prefs.defaultReportType}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    defaultReportType: e.target.value as "financial" | "annual",
                  })
                }
              >
                <option value="financial">דוחות כספיים</option>
                <option value="annual">דוחות שנתיים</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="defaultNotes">הערות ברירת מחדל</label>
            <textarea
              id="defaultNotes"
              className={styles.textarea}
              rows={3}
              value={prefs.defaultNotes}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultNotes: e.target.value })
              }
              placeholder="הערות שיוזנו אוטומטית בכל הרצה חדשה..."
            />
          </div>
          <button className="btn-primary" onClick={handleSave}>
            שמירה
          </button>
        </Card>

        {/* Section 2: System Info */}
        <Card>
          <h2 className={styles.sectionTitle}>מידע מערכת</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Sumit Sync API</span>
              <span className={styles.infoValue}>
                <StatusBadge
                  status={
                    syncHealth.status === "loading"
                      ? "processing"
                      : syncHealth.status === "healthy"
                        ? "completed"
                        : "failed"
                  }
                />
                {syncHealth.responseMs !== null && (
                  <span className={styles.responseTime}>
                    {syncHealth.responseMs}ms
                  </span>
                )}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Content Factory</span>
              <span className={styles.infoValue}>
                <StatusBadge
                  status={
                    factoryHealth.status === "loading"
                      ? "processing"
                      : factoryHealth.status === "healthy"
                        ? "completed"
                        : "failed"
                  }
                />
                {factoryHealth.responseMs !== null && (
                  <span className={styles.responseTime}>
                    {factoryHealth.responseMs}ms
                  </span>
                )}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>סה״כ הרצות</span>
              <span className={styles.infoValue}>
                {totalRuns !== null ? totalRuns : "—"}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>סה״כ מאמרים</span>
              <span className={styles.infoValue}>
                {totalArticles !== null ? totalArticles : "—"}
              </span>
            </div>
          </div>
        </Card>

        {/* Section 3: Data Management */}
        <Card>
          <h2 className={styles.sectionTitle}>ניהול נתונים</h2>
          <p className={styles.sectionDesc}>
            איפוס העדפות הסנכרון לערכי ברירת המחדל.
          </p>
          <button
            className="btn-secondary"
            onClick={() => setConfirmClear(true)}
          >
            איפוס העדפות
          </button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="איפוס העדפות"
        body="האם לאפס את כל העדפות הסנכרון? פעולה זו לא ניתנת לביטול."
        cancelLabel="ביטול"
        confirmLabel="אפס"
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClear}
      />
    </div>
  );
}
