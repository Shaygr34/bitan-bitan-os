"use client";

import { useEffect, useState, useMemo } from "react";
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
  const [pollingAll, setPollingAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

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

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return ideas;
    return ideas.filter((i) => i.status === statusFilter);
  }, [ideas, statusFilter]);

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

  async function handleDraft(idea: Idea) {
    setDrafting(idea.id);
    try {
      const res = await fetch(`/api/content-factory/ideas/${idea.id}/draft`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${res.status}`);
      }
      const data = await res.json();
      showToast({ type: "success", message: `טיוטה נוצרה — עלות: $${data.costUsd?.toFixed(3) ?? "N/A"}` });
      await fetchIdeas();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה ביצירת טיוטה: ${(err as Error).message}` });
    } finally {
      setDrafting(null);
    }
  }

  async function handlePollAll() {
    setPollingAll(true);
    try {
      const res = await fetch("/api/content-factory/sources/poll-all", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      showToast({
        type: "success",
        message: `נסרקו ${data.polled} מקורות: ${data.totalCreated} חדשים`,
      });
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

  return (
    <div>
      <PageHeader
        title="רעיונות לתוכן"
        description="רעיונות ממוינים לפי ציון רלוונטיות — בחרו ליצור טיוטה"
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-secondary" onClick={handlePollAll} disabled={pollingAll}>
              {pollingAll ? "סורק..." : "סרוק כל המקורות"}
            </button>
            <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
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

      {/* Status filters */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
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

            return (
              <div
                key={idea.id}
                style={{
                  border: "1px solid var(--border-color, #e5e7eb)",
                  borderRadius: "8px",
                  padding: "1rem 1.25rem",
                  background: idea.status === "REJECTED" ? "#fef2f2" : "#fff",
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
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    {canDraft && (
                      <button
                        className="btn-primary"
                        style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                        onClick={() => handleDraft(idea)}
                        disabled={drafting === idea.id}
                      >
                        {drafting === idea.id ? "יוצר טיוטה..." : "צור טיוטה"}
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
                    {canDraft && (
                      <button
                        style={{
                          background: "none",
                          border: "1px solid #ef4444",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          padding: "0.4rem 0.75rem",
                          borderRadius: "6px",
                        }}
                        onClick={() => handleReject(idea)}
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
