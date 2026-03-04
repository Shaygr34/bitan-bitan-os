"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { showToast } from "@/components/Toast";
import styles from "./sources.module.css";

interface Source {
  id: string;
  name: string;
  nameHe: string | null;
  type: string;
  url: string;
  active: boolean;
  weight: number;
  category: string | null;
  tags: string[];
  pollIntervalMin: number;
  lastPolledAt: string | null;
  lastItemCount: number | null;
  lastError: string | null;
  notes: string | null;
}

type SourceType = "RSS" | "API" | "SCRAPE" | "BROWSER" | "MANUAL";
type HealthStatus = "inactive" | "never-polled" | "error" | "stale" | "healthy";

interface HistoryEntry {
  id: string;
  createdAt: string;
  metadata: { itemsFound?: number; newIdeas?: number; duplicatesSkipped?: number };
}

interface DetectResult {
  detectedType: SourceType;
  sampleItems: { title: string; link: string }[];
  error?: string;
}

const CATEGORY_OPTIONS = ["Tax", "Legal", "Business-News", "Markets", "Payroll"];

const CATEGORY_HE: Record<string, string> = {
  Tax: "מיסים",
  Legal: "משפט ורגולציה",
  "Business-News": "עסקים וכלכלה",
  Markets: "שוק ההון",
  Payroll: "שכר ותעסוקה",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "לא נסקר";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

function getHealthStatus(source: Source): HealthStatus {
  if (!source.active) return "inactive";
  if (!source.lastPolledAt) return "never-polled";
  if (source.lastError) return "error";
  const elapsed = Date.now() - new Date(source.lastPolledAt).getTime();
  if (elapsed > source.pollIntervalMin * 3 * 60_000) return "stale";
  return "healthy";
}

function healthDotClass(status: HealthStatus): string {
  switch (status) {
    case "healthy": return styles.dotHealthy;
    case "error": return styles.dotError;
    case "stale": return styles.dotStale;
    case "never-polled": return styles.dotNever;
    case "inactive": return styles.dotInactive;
  }
}

function healthLabel(status: HealthStatus): string {
  switch (status) {
    case "healthy": return "תקין";
    case "error": return "שגיאה";
    case "stale": return "מיושן";
    case "never-polled": return "טרם נסרק";
    case "inactive": return "מושבת";
  }
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "RSS": return styles.typeBadgeRSS;
    case "API": return styles.typeBadgeAPI;
    case "SCRAPE": return styles.typeBadgeSCRAPE;
    case "BROWSER": return styles.typeBadgeBROWSER;
    default: return styles.typeBadgeMANUAL;
  }
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const [pollingAll, setPollingAll] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<string, { entries: HistoryEntry[]; ideaCount: number }>>({});
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");

  // Wizard state
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3>(0); // 0=closed, 1=url, 2=preview, 3=confirm
  const [wizardUrl, setWizardUrl] = useState("");
  const [wizardDetecting, setWizardDetecting] = useState(false);
  const [wizardResult, setWizardResult] = useState<DetectResult | null>(null);
  const [wizardName, setWizardName] = useState("");
  const [wizardCategory, setWizardCategory] = useState("Tax");
  const [wizardWeight, setWizardWeight] = useState("1.0");
  const [wizardCreating, setWizardCreating] = useState(false);

  const fetchSources = useCallback(async (retries = 2) => {
    try {
      const res = await fetch("/api/content-factory/sources");
      if (!res.ok) {
        if (res.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000));
          return fetchSources(retries - 1);
        }
        throw new Error(`${res.status}`);
      }
      setSources(await res.json());
    } catch (err) {
      if (retries > 0 && (err as Error).message !== "404") {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchSources(retries - 1);
      }
      showToast({ type: "error", message: `שגיאה בטעינת מקורות: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/content-factory/sources/seed", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const parts: string[] = [];
      if (data.created > 0) parts.push(`${data.created} חדשים`);
      if (data.updated > 0) parts.push(`${data.updated} עודכנו`);
      if (data.skipped > 0) parts.push(`${data.skipped} ללא שינוי`);
      if (data.deactivatedStale > 0) parts.push(`${data.deactivatedStale} מיושנים הושבתו`);
      showToast({ type: "success", message: parts.join(", ") || "אין שינויים" });
      await fetchSources();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setSeeding(false);
    }
  }

  async function handleDedup() {
    setDeduping(true);
    try {
      const res = await fetch("/api/content-factory/sources/dedup", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.deleted > 0) {
        showToast({ type: "success", message: `נמחקו ${data.deleted} כפילויות` });
        await fetchSources();
      } else {
        showToast({ type: "info", message: "אין כפילויות" });
      }
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setDeduping(false);
    }
  }

  async function handleToggleActive(source: Source) {
    try {
      const res = await fetch(`/api/content-factory/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !source.active }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, active: !s.active } : s)),
      );
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    }
  }

  async function handleDelete(source: Source) {
    if (!confirm(`למחוק את המקור "${source.nameHe || source.name}"?`)) return;
    try {
      const res = await fetch(`/api/content-factory/sources/${source.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      showToast({ type: "success", message: "המקור נמחק" });
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    }
  }

  async function handlePoll(sourceId: string) {
    setPolling(sourceId);
    try {
      const res = await fetch(`/api/content-factory/sources/${sourceId}/poll`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const hasErrors = data.errors && data.errors.length > 0;
      showToast({
        type: hasErrors && data.created === 0 ? "error" : "success",
        message: hasErrors
          ? `נסרק: ${data.created} חדשים, ${data.skipped} כפולים — שגיאה: ${data.errors[0]}`
          : `נסרק: ${data.created} חדשים, ${data.skipped} כפולים`,
      });
      await fetchSources();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה בסריקה: ${(err as Error).message}` });
    } finally {
      setPolling(null);
    }
  }

  async function handlePollAll() {
    setPollingAll(true);
    try {
      const res = await fetch("/api/content-factory/sources/poll-all", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const errCount = data.errors?.length ?? 0;
      showToast({
        type: errCount > 0 && data.totalCreated === 0 ? "error" : "success",
        message: errCount > 0
          ? `נסרקו ${data.polled} מקורות: ${data.totalCreated} חדשים, ${data.totalSkipped} כפולים (${errCount} שגיאות)`
          : `נסרקו ${data.polled} מקורות: ${data.totalCreated} חדשים, ${data.totalSkipped} כפולים`,
      });
      await fetchSources();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה בסריקה: ${(err as Error).message}` });
    } finally {
      setPollingAll(false);
    }
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────

  function openWizard() {
    setWizardStep(1);
    setWizardUrl("");
    setWizardResult(null);
    setWizardName("");
    setWizardCategory("Tax");
    setWizardWeight("1.0");
  }

  function closeWizard() {
    setWizardStep(0);
    setWizardResult(null);
  }

  async function handleDetect() {
    if (!wizardUrl.trim()) return;
    setWizardDetecting(true);
    try {
      const res = await fetch("/api/content-factory/sources/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: wizardUrl.trim() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: DetectResult = await res.json();
      setWizardResult(data);
      if (data.error) {
        showToast({ type: "error", message: data.error });
      } else {
        setWizardStep(2);
      }
    } catch (err) {
      showToast({ type: "error", message: `זיהוי נכשל: ${(err as Error).message}` });
    } finally {
      setWizardDetecting(false);
    }
  }

  async function handleWizardCreate() {
    if (!wizardResult || !wizardName.trim()) return;
    setWizardCreating(true);
    try {
      const res = await fetch("/api/content-factory/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wizardName.trim(),
          nameHe: wizardName.trim(),
          url: wizardUrl.trim(),
          type: wizardResult.detectedType,
          category: wizardCategory,
          weight: parseFloat(wizardWeight) || 1.0,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      showToast({ type: "success", message: "מקור נוצר בהצלחה" });
      closeWizard();
      await fetchSources();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setWizardCreating(false);
    }
  }

  // ── Detail panel ───────────────────────────────────────────────────────────

  async function toggleDetail(sourceId: string) {
    if (expandedDetail === sourceId) {
      setExpandedDetail(null);
      return;
    }
    setExpandedDetail(sourceId);
    if (!historyCache[sourceId]) {
      try {
        const res = await fetch(`/api/content-factory/sources/${sourceId}/history`);
        if (res.ok) {
          const data = await res.json();
          setHistoryCache((prev) => ({ ...prev, [sourceId]: data }));
        }
      } catch {
        // Silent fail — detail still shows config
      }
    }
  }

  // ── Health summary ─────────────────────────────────────────────────────────

  const healthMap = sources.reduce<Record<HealthStatus, number>>(
    (acc, s) => {
      acc[getHealthStatus(s)]++;
      return acc;
    },
    { inactive: 0, "never-polled": 0, error: 0, stale: 0, healthy: 0 },
  );

  const activeCount = sources.filter((s) => s.active).length;

  return (
    <div>
      <PageHeader
        title="מקורות תוכן"
        description="ניהול מקורות RSS, API וסריקה — הזנת רעיונות למפעל התוכן"
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-secondary" onClick={handleDedup} disabled={deduping}>
              {deduping ? "מנקה..." : "נקה כפילויות"}
            </button>
            <button className="btn-secondary" onClick={handlePollAll} disabled={pollingAll}>
              {pollingAll ? "סורק..." : "סרוק הכל"}
            </button>
            <button className="btn-secondary" onClick={handleSeed} disabled={seeding}>
              {seeding ? "מעדכן..." : "טען ברירת מחדל"}
            </button>
            <button className="btn-primary" onClick={wizardStep > 0 ? closeWizard : openWizard}>
              {wizardStep > 0 ? "בטל" : "הוסף מקור"}
            </button>
          </div>
        }
      />

      {/* Health summary bar + view toggle */}
      {!loading && sources.length > 0 && (
        <div className={styles.summaryBar}>
          <span className={styles.summaryPill}>
            <span className={`${styles.dot} ${styles.dotTotal}`} />
            {sources.length} סה״כ
          </span>
          <span className={styles.summaryPill}>
            <span className={`${styles.dot} ${styles.dotActive}`} />
            {activeCount} פעילים
          </span>
          <span className={styles.summaryPill}>
            <span className={`${styles.dot} ${styles.dotHealthy}`} />
            {healthMap.healthy} תקינים
          </span>
          {healthMap.error > 0 && (
            <span className={styles.summaryPill}>
              <span className={`${styles.dot} ${styles.dotError}`} />
              {healthMap.error} שגיאות
            </span>
          )}
          {healthMap.stale > 0 && (
            <span className={styles.summaryPill}>
              <span className={`${styles.dot} ${styles.dotStale}`} />
              {healthMap.stale} מיושנים
            </span>
          )}
          {healthMap["never-polled"] > 0 && (
            <span className={styles.summaryPill}>
              <span className={`${styles.dot} ${styles.dotNever}`} />
              {healthMap["never-polled"]} טרם נסרקו
            </span>
          )}
          <span style={{ marginInlineStart: "auto" }}>
            <button
              className={viewMode === "table" ? "btn-primary" : "btn-secondary"}
              style={{ fontSize: "var(--font-size-xs)", padding: "2px 8px", borderRadius: "4px 0 0 4px" }}
              onClick={() => setViewMode("table")}
            >
              טבלה
            </button>
            <button
              className={viewMode === "cards" ? "btn-primary" : "btn-secondary"}
              style={{ fontSize: "var(--font-size-xs)", padding: "2px 8px", borderRadius: "0 4px 4px 0", marginInlineStart: "-1px" }}
              onClick={() => setViewMode("cards")}
            >
              כרטיסים
            </button>
          </span>
        </div>
      )}

      {/* Add Source Wizard */}
      {wizardStep >= 1 && (
        <div className={styles.wizard}>
          <h3 className={styles.wizardTitle}>הוספת מקור חדש</h3>

          {/* Step 1: URL input */}
          <div className={styles.wizardStep}>
            <div className={styles.wizardUrlRow}>
              <input
                className={styles.wizardUrlInput}
                type="url"
                value={wizardUrl}
                onChange={(e) => setWizardUrl(e.target.value)}
                placeholder="הדביקו כתובת URL..."
                dir="ltr"
                onKeyDown={(e) => { if (e.key === "Enter") handleDetect(); }}
              />
              <button
                className="btn-primary"
                onClick={handleDetect}
                disabled={wizardDetecting || !wizardUrl.trim()}
              >
                {wizardDetecting ? "מזהה..." : "זהה"}
              </button>
            </div>
          </div>

          {/* Step 2: Preview */}
          {wizardStep >= 2 && wizardResult && !wizardResult.error && (
            <div className={styles.wizardStep}>
              <div className={styles.wizardPreview}>
                <div style={{ marginBottom: "var(--space-sm)", display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                  <span>זוהה כ:</span>
                  <span className={`${styles.typeBadge} ${typeBadgeClass(wizardResult.detectedType)}`}>
                    {wizardResult.detectedType}
                  </span>
                  <span style={{ color: "var(--text-caption)", fontSize: "var(--font-size-sm)" }}>
                    ({wizardResult.sampleItems.length} פריטים לדוגמה)
                  </span>
                </div>
                {wizardResult.sampleItems.map((item, i) => (
                  <div key={i} className={styles.wizardPreviewItem}>
                    <div className={styles.wizardPreviewTitle}>{item.title}</div>
                    {item.link && (
                      <span className={styles.wizardPreviewLink}>{item.link}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.wizardForm}>
                <div className={styles.wizardField}>
                  <label>שם (עברית)</label>
                  <input
                    type="text"
                    value={wizardName}
                    onChange={(e) => setWizardName(e.target.value)}
                    placeholder="למשל: גלובס — מיסים"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className={styles.wizardField}>
                  <label>קטגוריה</label>
                  <select
                    value={wizardCategory}
                    onChange={(e) => setWizardCategory(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{CATEGORY_HE[c] ?? c}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.wizardField}>
                  <label>משקל</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={wizardWeight}
                    onChange={(e) => setWizardWeight(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div className={styles.wizardActions}>
                <button
                  className="btn-primary"
                  onClick={handleWizardCreate}
                  disabled={wizardCreating || !wizardName.trim()}
                >
                  {wizardCreating ? "יוצר..." : "צור מקור"}
                </button>
                <button className="btn-secondary" onClick={closeWizard}>
                  בטל
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <div style={{ padding: "2rem", textAlign: "center" }}>טוען...</div>}

      {!loading && sources.length === 0 && (
        <EmptyState
          message="אין מקורות עדיין"
          detail="לחצו על ׳טען ברירת מחדל׳ או ׳הוסף מקור׳ כדי להתחיל"
        />
      )}

      {/* Table view */}
      {!loading && sources.length > 0 && viewMode === "table" && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr>
              <th>שם</th>
              <th>סוג</th>
              <th>סטטוס</th>
              <th>פעיל</th>
              <th>סריקה אחרונה</th>
              <th>פריטים</th>
              <th>שגיאה</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const health = getHealthStatus(source);
              const isDetailExpanded = expandedDetail === source.id;
              const history = historyCache[source.id];
              return (
                <tr key={source.id} style={{ opacity: source.active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 500, maxWidth: "14rem" }}>
                    {source.nameHe || source.name}
                  </td>
                  <td>
                    <span className={`${styles.typeBadge} ${typeBadgeClass(source.type)}`}>
                      {source.type}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <span className={`${styles.healthDot} ${healthDotClass(health)}`}
                        style={{ width: 8, height: 8 }}
                      />
                      {healthLabel(health)}
                    </span>
                  </td>
                  <td>
                    <button
                      className={styles.activeToggle}
                      onClick={() => handleToggleActive(source)}
                      title={source.active ? "כבה" : "הפעל"}
                    >
                      {source.active ? "✅" : "⬜"}
                    </button>
                  </td>
                  <td style={{ fontSize: "var(--font-size-xs)", color: "var(--text-caption)" }}>
                    {relativeTime(source.lastPolledAt)}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {source.lastItemCount ?? "-"}
                  </td>
                  <td style={{ maxWidth: "12rem" }}>
                    {source.lastError ? (
                      <button
                        className={styles.errorToggle}
                        style={{ padding: "2px 4px", fontSize: "var(--font-size-xs)" }}
                        onClick={() => setExpandedErrors((prev) => {
                          const next = new Set(prev);
                          if (next.has(source.id)) next.delete(source.id);
                          else next.add(source.id);
                          return next;
                        })}
                        title={source.lastError}
                      >
                        {expandedErrors.has(source.id) ? source.lastError.slice(0, 80) : "שגיאה ◀"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--text-caption)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {(source.type === "RSS" || source.type === "API" || source.type === "SCRAPE" || source.type === "BROWSER") && (
                        <button
                          className={`btn-secondary ${styles.pollBtn}`}
                          onClick={() => handlePoll(source.id)}
                          disabled={polling === source.id}
                        >
                          {polling === source.id ? "..." : "סרוק"}
                        </button>
                      )}
                      <button
                        className={styles.expandBtn}
                        onClick={() => toggleDetail(source.id)}
                      >
                        {isDetailExpanded ? "▲" : "▼"}
                      </button>
                      <button className={styles.deleteBtn} onClick={() => handleDelete(source)}>
                        מחק
                      </button>
                    </div>
                    {isDetailExpanded && (
                      <div className={styles.detailPanel} style={{ marginTop: "8px" }}>
                        <div className={styles.detailGrid}>
                          <span className={styles.detailLabel}>URL</span>
                          <a className={styles.detailUrl} href={source.url} target="_blank" rel="noopener noreferrer">
                            {source.url}
                          </a>
                          <span className={styles.detailLabel}>משקל</span>
                          <span className={styles.detailValue}>{source.weight}</span>
                          <span className={styles.detailLabel}>קטגוריה</span>
                          <span className={styles.detailValue}>{CATEGORY_HE[source.category ?? ""] ?? source.category ?? "-"}</span>
                          {source.notes && (
                            <>
                              <span className={styles.detailLabel}>הערות</span>
                              <span className={styles.detailValue}>{source.notes}</span>
                            </>
                          )}
                        </div>
                        {history && (
                          <>
                            <div className={styles.ideaCount}>רעיונות: {history.ideaCount}</div>
                            {history.entries.length > 0 && (
                              <table className={styles.historyTable}>
                                <thead><tr><th>זמן</th><th>פריטים</th><th>חדשים</th><th>כפולים</th></tr></thead>
                                <tbody>
                                  {history.entries.map((entry) => (
                                    <tr key={entry.id}>
                                      <td>{relativeTime(entry.createdAt)}</td>
                                      <td>{entry.metadata.itemsFound ?? "-"}</td>
                                      <td>{entry.metadata.newIdeas ?? "-"}</td>
                                      <td>{entry.metadata.duplicatesSkipped ?? "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Card view */}
      {!loading && sources.length > 0 && viewMode === "cards" && (
        <div className={styles.cardGrid}>
          {sources.map((source) => {
            const health = getHealthStatus(source);
            const isErrorExpanded = expandedErrors.has(source.id);
            const isDetailExpanded = expandedDetail === source.id;
            const history = historyCache[source.id];

            return (
              <div
                key={source.id}
                className={`${styles.card} ${!source.active ? styles.cardInactive : ""}`}
              >
                {/* Header */}
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardName}>
                    {source.nameHe || source.name}
                  </h3>
                  <span className={`${styles.typeBadge} ${typeBadgeClass(source.type)}`}>
                    {source.type}
                  </span>
                  {source.category && (
                    <span className={styles.categoryBadge}>
                      {CATEGORY_HE[source.category] ?? source.category}
                    </span>
                  )}
                  <button
                    className={styles.activeToggle}
                    onClick={() => handleToggleActive(source)}
                    title={source.active ? "כבה" : "הפעל"}
                  >
                    {source.active ? "✅" : "⬜"}
                  </button>
                </div>

                {/* Status row */}
                <div className={styles.statusRow}>
                  <span className={`${styles.healthDot} ${healthDotClass(health)}`} />
                  <span className={styles.statusText}>
                    {healthLabel(health)} · {relativeTime(source.lastPolledAt)}
                  </span>
                  {source.lastItemCount !== null && (
                    <span className={styles.itemCount}>{source.lastItemCount} פריטים</span>
                  )}
                </div>

                {/* Error section */}
                {source.lastError && (
                  <div className={styles.errorSection}>
                    <button
                      className={styles.errorToggle}
                      onClick={() => setExpandedErrors((prev) => {
                        const next = new Set(prev);
                        if (next.has(source.id)) next.delete(source.id);
                        else next.add(source.id);
                        return next;
                      })}
                    >
                      <span className={`${styles.errorChevron} ${isErrorExpanded ? styles.errorChevronOpen : ""}`}>
                        ◀
                      </span>
                      שגיאה
                    </button>
                    {isErrorExpanded && (
                      <div className={styles.errorDetail}>{source.lastError}</div>
                    )}
                  </div>
                )}

                {/* Detail panel (expandable) */}
                {isDetailExpanded && (
                  <div className={styles.detailPanel}>
                    <div className={styles.detailGrid}>
                      <span className={styles.detailLabel}>URL</span>
                      <a
                        className={styles.detailUrl}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.url}
                      </a>
                      <span className={styles.detailLabel}>משקל</span>
                      <span className={styles.detailValue}>{source.weight}</span>
                      <span className={styles.detailLabel}>מרווח סריקה</span>
                      <span className={styles.detailValue}>{source.pollIntervalMin} דקות</span>
                      {source.tags.length > 0 && (
                        <>
                          <span className={styles.detailLabel}>תגיות</span>
                          <span className={styles.detailValue}>{source.tags.join(", ")}</span>
                        </>
                      )}
                      {source.notes && (
                        <>
                          <span className={styles.detailLabel}>הערות</span>
                          <span className={styles.detailValue}>{source.notes}</span>
                        </>
                      )}
                    </div>

                    {history && (
                      <>
                        <div className={styles.ideaCount}>
                          סה״כ רעיונות ממקור זה: {history.ideaCount}
                        </div>
                        {history.entries.length > 0 && (
                          <table className={styles.historyTable}>
                            <thead>
                              <tr>
                                <th>זמן</th>
                                <th>פריטים</th>
                                <th>חדשים</th>
                                <th>כפולים</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.entries.map((entry) => (
                                <tr key={entry.id}>
                                  <td>{relativeTime(entry.createdAt)}</td>
                                  <td>{entry.metadata.itemsFound ?? "-"}</td>
                                  <td>{entry.metadata.newIdeas ?? "-"}</td>
                                  <td>{entry.metadata.duplicatesSkipped ?? "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className={styles.cardFooter}>
                  {(source.type === "RSS" || source.type === "API" || source.type === "SCRAPE" || source.type === "BROWSER") && (
                    <button
                      className={`btn-secondary ${styles.pollBtn}`}
                      onClick={() => handlePoll(source.id)}
                      disabled={polling === source.id}
                    >
                      {polling === source.id ? "סורק..." : "סרוק"}
                    </button>
                  )}
                  <button
                    className={styles.expandBtn}
                    onClick={() => toggleDetail(source.id)}
                  >
                    {isDetailExpanded ? "הסתר פרטים ▲" : "פרטים ▼"}
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(source)}
                  >
                    מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
