"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { showToast } from "@/components/Toast";
import styles from "./page.module.css";

interface IdeaArticle {
  id: string;
  title: string;
  status: string;
}

interface IdeaSource {
  id: string;
  name: string;
  nameHe: string | null;
  type: string;
}

interface Idea {
  id: string;
  title: string;
  description: string | null;
  sourceType: string;
  sourceUrl: string | null;
  tags: string[];
  status: string;
  score: number | null;
  scoreBreakdown: Record<string, unknown> | null;
  sourcePublishedAt: string | null;
  source: IdeaSource | null;
  articles: IdeaArticle[];
  createdAt: string;
}

interface PollProgress {
  current: number;
  total: number;
  currentSource: string;
  results: Array<{ name: string; created: number; error?: string }>;
}

type StatusFilter = "ALL" | "NEW" | "SELECTED" | "ENRICHED" | "REJECTED";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "הכל" },
  { value: "NEW", label: "חדש" },
  { value: "SELECTED", label: "נבחר" },
  { value: "ENRICHED", label: "טיוטה נוצרה" },
  { value: "REJECTED", label: "נדחה" },
];

const STATUS_COLORS: Record<string, string> = {
  NEW: "#3b82f6",
  SELECTED: "#8b5cf6",
  ENRICHED: "#10b981",
  REJECTED: "#ef4444",
  ARCHIVED: "#6b7280",
  QUEUED_FOR_DRAFT: "#f59e0b",
};

function scoreColor(score: number | null): string {
  if (score === null) return "#6b7280";
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draftElapsed, setDraftElapsed] = useState(0);
  const [draftResult, setDraftResult] = useState<{ id: string; articleId?: string; error?: string } | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pollingAll, setPollingAll] = useState(false);
  const [pollProgress, setPollProgress] = useState<PollProgress | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");

  const MIN_DISPLAY_SCORE = 45;

  const fetchIdeas = useCallback(async (retries = 2) => {
    try {
      const res = await fetch("/api/content-factory/ideas?sort=score:desc");
      if (!res.ok) {
        if (res.status >= 500 && retries > 0) {
          await new Promise((r) => setTimeout(r, 1000));
          return fetchIdeas(retries - 1);
        }
        throw new Error(`${res.status}`);
      }
      setIdeas(await res.json());
    } catch (err) {
      if (retries > 0 && (err as Error).message !== "404") {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchIdeas(retries - 1);
      }
      showToast({ type: "error", message: `שגיאה בטעינת רעיונות: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearInterval(draftTimerRef.current);
    };
  }, []);

  const uniqueSources = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const idea of ideas) {
      if (idea.source) {
        map.set(idea.source.id, {
          id: idea.source.id,
          label: idea.source.nameHe || idea.source.name,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "he"));
  }, [ideas]);

  const filtered = useMemo(() => {
    let result = ideas;
    if (statusFilter !== "ALL") {
      result = result.filter((i) => i.status === statusFilter);
    }
    if (sourceFilter !== "ALL") {
      result = result.filter((i) => i.source?.id === sourceFilter);
    }
    if (!showAll) {
      result = result.filter(
        (i) => (i.score ?? 0) >= MIN_DISPLAY_SCORE || i.status === "ENRICHED" || i.status === "SELECTED",
      );
    }
    return result;
  }, [ideas, statusFilter, sourceFilter, showAll]);

  const hiddenCount = useMemo(() => {
    const withStatus = statusFilter === "ALL" ? ideas : ideas.filter((i) => i.status === statusFilter);
    return withStatus.length - filtered.length;
  }, [ideas, statusFilter, filtered.length]);

  async function handleReject(idea: Idea) {
    try {
      const res = await fetch(`/api/content-factory/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: "REJECTED" } : i)));
      showToast({ type: "success", message: "הרעיון נדחה" });
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    }
  }

  async function handleDelete(idea: Idea) {
    if (!confirm(`למחוק את "${idea.title}"?`)) return;
    setDeleting(idea.id);
    try {
      const res = await fetch(`/api/content-factory/ideas/${idea.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);
      setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
      showToast({ type: "success", message: "הרעיון נמחק" });
    } catch (err) {
      showToast({ type: "error", message: `שגיאה במחיקה: ${(err as Error).message}` });
    } finally {
      setDeleting(null);
    }
  }

  const handleDraft = useCallback(async (idea: Idea) => {
    setDrafting(idea.id);
    setDraftElapsed(0);
    setDraftResult(null);

    draftTimerRef.current = setInterval(() => {
      setDraftElapsed((prev) => prev + 1);
    }, 1000);

    try {
      const res = await fetch(`/api/content-factory/ideas/${idea.id}/draft`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `שגיאה ${res.status}`);
      }
      const data = await res.json();
      setDraftResult({ id: idea.id, articleId: data.articleId });
      showToast({ type: "success", message: `טיוטה נוצרה — עלות: $${data.costUsd?.toFixed(3) ?? "N/A"}` });
      await fetchIdeas();
    } catch (err) {
      const msg = (err as Error).message;
      setDraftResult({ id: idea.id, error: msg });
      showToast({ type: "error", message: `שגיאה ביצירת טיוטה: ${msg}` });
    } finally {
      if (draftTimerRef.current) {
        clearInterval(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      setDrafting(null);
    }
  }, [fetchIdeas]);

  async function handlePollAll() {
    setPollingAll(true);
    setPollProgress(null);

    try {
      // Fetch active sources
      const sourcesRes = await fetch("/api/content-factory/sources?active=true");
      if (!sourcesRes.ok) throw new Error(`Failed to fetch sources: ${sourcesRes.status}`);
      const sources: Array<{ id: string; name: string; nameHe: string | null; type: string; active: boolean }> =
        await sourcesRes.json();

      // Filter to pollable types (not MANUAL)
      const pollable = sources.filter((s) => s.active && s.type !== "MANUAL");
      if (pollable.length === 0) {
        showToast({ type: "error", message: "אין מקורות פעילים לסריקה" });
        return;
      }

      const progress: PollProgress = {
        current: 0,
        total: pollable.length,
        currentSource: "",
        results: [],
      };
      setPollProgress({ ...progress });

      // Poll sources sequentially
      for (const source of pollable) {
        progress.current++;
        progress.currentSource = source.nameHe || source.name;
        setPollProgress({ ...progress });

        try {
          const res = await fetch(`/api/content-factory/sources/${source.id}/poll`, { method: "POST" });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: `${res.status}` }));
            progress.results.push({
              name: source.nameHe || source.name,
              created: 0,
              error: errData.error ?? `${res.status}`,
            });
          } else {
            const data = await res.json();
            progress.results.push({
              name: source.nameHe || source.name,
              created: data.created ?? 0,
            });
          }
        } catch (err) {
          progress.results.push({
            name: source.nameHe || source.name,
            created: 0,
            error: (err as Error).message,
          });
        }
        setPollProgress({ ...progress });
      }

      // Summary
      const totalCreated = progress.results.reduce((sum, r) => sum + r.created, 0);
      const errors = progress.results.filter((r) => r.error);
      if (errors.length === 0) {
        showToast({ type: "success", message: `נסרקו ${pollable.length} מקורות: ${totalCreated} רעיונות חדשים` });
      } else {
        showToast({
          type: "error",
          message: `${pollable.length - errors.length} הצליחו (${totalCreated} חדשים), ${errors.length} נכשלו`,
        });
      }

      await fetchIdeas();

      // Clear progress after 5s
      setTimeout(() => setPollProgress(null), 5000);
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
      setPollProgress(null);
    } finally {
      setPollingAll(false);
    }
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/content-factory/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setNewTitle("");
      setShowCreate(false);
      showToast({ type: "success", message: "רעיון נוצר" });
      await fetchIdeas();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setCreating(false);
    }
  }

  const isBusy = drafting !== null;

  return (
    <div>
      <PageHeader
        title="רעיונות לתוכן"
        description="רעיונות ממוינים לפי ציון רלוונטיות — בחרו ליצור טיוטה"
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-secondary" onClick={handlePollAll} disabled={pollingAll || isBusy}>
              {pollingAll ? "סורק..." : "סרוק כל המקורות"}
            </button>
            <button className="btn-primary" onClick={() => setShowCreate(!showCreate)} disabled={isBusy}>
              רעיון ידני
            </button>
          </div>
        }
      />

      {/* Poll progress */}
      {pollProgress && (
        <div className={styles.pollProgress}>
          <div className={styles.pollProgressHeader}>
            <span>סורק {pollProgress.current}/{pollProgress.total}: {pollProgress.currentSource}</span>
            <span>{Math.round((pollProgress.current / pollProgress.total) * 100)}%</span>
          </div>
          <div className={styles.pollProgressBar}>
            <div
              className={styles.pollProgressFill}
              style={{ width: `${(pollProgress.current / pollProgress.total) * 100}%` }}
            />
          </div>
          {pollProgress.current === pollProgress.total && pollProgress.results.length > 0 && (
            <div className={styles.pollResults}>
              {pollProgress.results
                .filter((r) => r.created > 0 || r.error)
                .map((r, i) => (
                  <div key={i} className={styles.pollResultItem}>
                    <span>{r.name}</span>
                    {r.error ? (
                      <span className={styles.pollResultError}>{r.error.length > 30 ? r.error.slice(0, 30) + "..." : r.error}</span>
                    ) : (
                      <span className={styles.pollResultSuccess}>+{r.created}</span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Manual idea creation form */}
      {showCreate && (
        <div className={styles.createForm}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="כותרת הרעיון..."
            className={styles.createInput}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? "יוצר..." : "צור"}
          </button>
        </div>
      )}

      {/* Status filters + score toggle */}
      <div className={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={statusFilter === f.value ? styles.filterPillActive : styles.filterPill}
          >
            {f.label}
          </button>
        ))}

        <span className={styles.filterDivider} />

        {uniqueSources.length > 1 && (
          <select
            className={styles.sourceSelect}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="ALL">כל המקורות</option>
            {uniqueSources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}

        <span className={styles.filterDivider} />

        <button
          onClick={() => setShowAll(!showAll)}
          className={showAll ? styles.showAllPillActive : styles.showAllPill}
        >
          {showAll ? "סינון לפי ציון" : `הצג הכל${hiddenCount > 0 ? ` (+${hiddenCount})` : ""}`}
        </button>
      </div>

      {loading && <div style={{ padding: "2rem", textAlign: "center" }}>טוען...</div>}

      {!loading && filtered.length === 0 && (
        <EmptyState
          message={ideas.length === 0 ? "אין רעיונות עדיין" : "אין רעיונות בסטטוס זה"}
          detail={ideas.length === 0 ? "הוסיפו מקורות וסרקו כדי ליצור רעיונות" : undefined}
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className={styles.ideaList}>
          {filtered.map((idea) => {
            const linkedArticle = idea.articles[0] ?? null;
            const isEnriched = idea.status === "ENRICHED";
            const canDraft = idea.status === "NEW" || idea.status === "SELECTED";
            const isDraftingThis = drafting === idea.id;
            const result = draftResult?.id === idea.id ? draftResult : null;
            const isDeletingThis = deleting === idea.id;

            const cardClass = isDraftingThis
              ? styles.ideaCardDrafting
              : idea.status === "REJECTED"
                ? styles.ideaCardRejected
                : styles.ideaCard;

            return (
              <div
                key={idea.id}
                className={`${cardClass}${isBusy && !isDraftingThis ? ` ${styles.ideaCardDimmed}` : ""}`}
              >
                <div className={styles.cardLayout}>
                  <div className={styles.cardContent}>
                    <div className={styles.badgeRow}>
                      {/* Score badge + bar */}
                      {idea.score !== null && (
                        <>
                          <span
                            className={styles.scoreBadge}
                            style={{ backgroundColor: scoreColor(idea.score) }}
                          >
                            {Math.round(idea.score)}
                          </span>
                          <div className={styles.scoreBar}>
                            <div
                              className={styles.scoreBarFill}
                              style={{
                                width: `${Math.min(100, Math.round(idea.score))}%`,
                                backgroundColor: scoreColor(idea.score),
                              }}
                            />
                          </div>
                        </>
                      )}

                      {/* Status badge */}
                      <span
                        className={styles.statusBadge}
                        style={{ backgroundColor: STATUS_COLORS[idea.status] ?? "#6b7280" }}
                      >
                        {STATUS_FILTERS.find((f) => f.value === idea.status)?.label ?? idea.status}
                      </span>

                      {isEnriched && linkedArticle && (
                        <span className={styles.enrichedLabel}>טיוטה נוצרה</span>
                      )}
                    </div>

                    <h3 className={styles.ideaTitle}>{idea.title}</h3>

                    {idea.description && (
                      <p className={styles.ideaDescription}>
                        {idea.description.slice(0, 200)}{idea.description.length > 200 ? "..." : ""}
                      </p>
                    )}

                    <div className={styles.metaRow}>
                      {idea.source && (
                        <span className={styles.sourcePill}>
                          {idea.source.nameHe || idea.source.name}
                        </span>
                      )}
                      {idea.sourcePublishedAt && (
                        <span>{relativeTime(idea.sourcePublishedAt)}</span>
                      )}
                      {idea.tags.length > 0 && (
                        <span>{idea.tags.slice(0, 3).join(", ")}</span>
                      )}
                      {idea.sourceUrl && (
                        <a
                          href={idea.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.sourceLink}
                          onClick={(e) => e.stopPropagation()}
                        >
                          מאמר מקורי
                        </a>
                      )}
                    </div>

                    {/* Draft result feedback */}
                    {result?.articleId && (
                      <div className={styles.draftResultRow}>
                        <span className={styles.draftSuccess}>טיוטה נוצרה!</span>
                        <Link
                          href={`/content-factory/articles/${result.articleId}`}
                          style={{ color: "#2563eb", fontSize: "0.85rem" }}
                        >
                          צפה במאמר
                        </Link>
                      </div>
                    )}
                    {result?.error && (
                      <div className={styles.draftResultRow}>
                        <span className={styles.draftError}>
                          נכשל — {result.error.length > 80 ? result.error.slice(0, 80) + "..." : result.error}
                        </span>
                        <button
                          className={styles.retryBtn}
                          onClick={() => { setDraftResult(null); handleDraft(idea); }}
                        >
                          נסו שוב
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={styles.actions}>
                    {isDraftingThis && (
                      <span className={styles.draftingLabel}>
                        {draftElapsed > 45 ? "עדיין עובד..." : "יוצר טיוטה..."} ({draftElapsed} שניות)
                      </span>
                    )}
                    {canDraft && !isDraftingThis && (
                      <button
                        className="btn-primary"
                        style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                        onClick={() => handleDraft(idea)}
                        disabled={isBusy}
                      >
                        צור טיוטה
                      </button>
                    )}
                    {linkedArticle && (
                      <Link
                        href={`/content-factory/articles/${linkedArticle.id}`}
                        className="btn-secondary"
                        style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", textDecoration: "none" }}
                      >
                        צפה במאמר
                      </Link>
                    )}
                    {canDraft && !isDraftingThis && (
                      <button
                        className={styles.rejectBtn}
                        onClick={() => handleReject(idea)}
                        disabled={isBusy}
                      >
                        דחה
                      </button>
                    )}
                    {/* Delete button */}
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(idea)}
                      disabled={isBusy || isDeletingThis}
                      title="מחק רעיון"
                    >
                      {isDeletingThis ? "..." : "🗑"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
