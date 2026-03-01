"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { showToast } from "@/components/Toast";

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

interface PollSourceError {
  sourceId: string;
  name: string;
  error: string;
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
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const MIN_DISPLAY_SCORE = 45;

  async function fetchIdeas() {
    try {
      const res = await fetch("/api/content-factory/ideas?sort=score:desc");
      if (!res.ok) throw new Error(`${res.status}`);
      setIdeas(await res.json());
    } catch (err) {
      showToast({ type: "error", message: `שגיאה בטעינת רעיונות: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchIdeas(); }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearInterval(draftTimerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    let result = ideas;
    if (statusFilter !== "ALL") {
      result = result.filter((i) => i.status === statusFilter);
    }
    if (!showAll) {
      result = result.filter(
        (i) => (i.score ?? 0) >= MIN_DISPLAY_SCORE || i.status === "ENRICHED" || i.status === "SELECTED",
      );
    }
    return result;
  }, [ideas, statusFilter, showAll]);

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

  const handleDraft = useCallback(async (idea: Idea) => {
    setDrafting(idea.id);
    setDraftElapsed(0);
    setDraftResult(null);

    // Start elapsed timer
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
  }, []);

  async function handlePollAll() {
    setPollingAll(true);
    try {
      const res = await fetch("/api/content-factory/sources/poll-all", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const errors = (data.errors ?? []) as PollSourceError[];

      if (errors.length === 0) {
        showToast({
          type: "success",
          message: `נסרקו ${data.polled} מקורות: ${data.totalCreated} חדשים, ${data.totalSkipped} כפולים`,
        });
      } else {
        const failedNames = errors
          .map((e: PollSourceError) => {
            const shortErr = e.error.includes("403") ? "403" : e.error.includes("timeout") ? "timeout" : "error";
            return `${e.name} (${shortErr})`;
          })
          .join(", ");
        const okCount = data.polled - errors.length;
        showToast({
          type: "warning",
          message: `${okCount} מקורות הצליחו (${data.totalCreated} חדשים). נכשלו: ${failedNames}`,
        });
      }
      await fetchIdeas();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
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

  /** Whether any draft is in progress (disables all action buttons) */
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

      {/* Manual idea creation form */}
      {showCreate && (
        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="כותרת הרעיון..."
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--border-color, #d1d5db)",
              borderRadius: "6px",
              fontSize: "0.9rem",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? "יוצר..." : "צור"}
          </button>
        </div>
      )}

      {/* Status filters + score toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              padding: "0.35rem 0.75rem",
              border: statusFilter === f.value ? "2px solid #2563eb" : "1px solid var(--border-color, #d1d5db)",
              borderRadius: "6px",
              background: statusFilter === f.value ? "#eff6ff" : "transparent",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: statusFilter === f.value ? 600 : 400,
            }}
          >
            {f.label}
          </button>
        ))}

        <span style={{ borderInlineStart: "1px solid var(--border-color, #d1d5db)", height: "1.5rem", marginInline: "0.25rem" }} />

        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            padding: "0.35rem 0.75rem",
            border: showAll ? "2px solid #f59e0b" : "1px solid var(--border-color, #d1d5db)",
            borderRadius: "6px",
            background: showAll ? "#fffbeb" : "transparent",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: showAll ? 600 : 400,
          }}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((idea) => {
            const linkedArticle = idea.articles[0] ?? null;
            const isEnriched = idea.status === "ENRICHED";
            const canDraft = idea.status === "NEW" || idea.status === "SELECTED";
            const isDraftingThis = drafting === idea.id;
            const result = draftResult?.id === idea.id ? draftResult : null;

            return (
              <div
                key={idea.id}
                style={{
                  border: isDraftingThis
                    ? "2px solid #2563eb"
                    : "1px solid var(--border-color, #e5e7eb)",
                  borderRadius: "8px",
                  padding: "1rem 1.25rem",
                  background: isDraftingThis
                    ? "#eff6ff"
                    : idea.status === "REJECTED"
                      ? "#fef2f2"
                      : "#fff",
                  opacity: isBusy && !isDraftingThis ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
                      {/* Score badge */}
                      {idea.score !== null && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#fff",
                            backgroundColor: scoreColor(idea.score),
                          }}
                        >
                          {Math.round(idea.score)}
                        </span>
                      )}

                      {/* Status badge */}
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: "#fff",
                          backgroundColor: STATUS_COLORS[idea.status] ?? "#6b7280",
                        }}
                      >
                        {STATUS_FILTERS.find((f) => f.value === idea.status)?.label ?? idea.status}
                      </span>

                      {isEnriched && linkedArticle && (
                        <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 500 }}>
                          טיוטה נוצרה
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{idea.title}</h3>

                    {idea.description && (
                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.4 }}>
                        {idea.description.slice(0, 200)}{idea.description.length > 200 ? "..." : ""}
                      </p>
                    )}

                    <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.8rem", color: "#9ca3af" }}>
                      {idea.source && (
                        <span>{idea.source.nameHe || idea.source.name}</span>
                      )}
                      {idea.sourcePublishedAt && (
                        <span>{relativeTime(idea.sourcePublishedAt)}</span>
                      )}
                      {idea.tags.length > 0 && (
                        <span>{idea.tags.slice(0, 3).join(", ")}</span>
                      )}
                    </div>

                    {/* Draft result feedback */}
                    {result?.articleId && (
                      <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: "#10b981", fontWeight: 600, fontSize: "0.85rem" }}>
                          טיוטה נוצרה!
                        </span>
                        <Link
                          href={`/content-factory/articles/${result.articleId}`}
                          style={{ color: "#2563eb", fontSize: "0.85rem" }}
                        >
                          צפה במאמר
                        </Link>
                      </div>
                    )}
                    {result?.error && (
                      <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ color: "#ef4444", fontWeight: 600, fontSize: "0.85rem" }}>
                          נכשל — {result.error.length > 80 ? result.error.slice(0, 80) + "..." : result.error}
                        </span>
                        <button
                          style={{
                            background: "none",
                            border: "1px solid #2563eb",
                            color: "#2563eb",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                          }}
                          onClick={() => { setDraftResult(null); handleDraft(idea); }}
                        >
                          נסו שוב
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
                    {isDraftingThis && (
                      <span style={{ fontSize: "0.8rem", color: "#2563eb", fontWeight: 500, whiteSpace: "nowrap" }}>
                        יוצר טיוטה... ({draftElapsed} שניות)
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
                        style={{
                          background: "none",
                          border: "1px solid #ef4444",
                          color: "#ef4444",
                          cursor: isBusy ? "not-allowed" : "pointer",
                          fontSize: "0.8rem",
                          padding: "0.4rem 0.75rem",
                          borderRadius: "6px",
                          opacity: isBusy ? 0.5 : 1,
                        }}
                        onClick={() => handleReject(idea)}
                        disabled={isBusy}
                      >
                        דחה
                      </button>
                    )}
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
