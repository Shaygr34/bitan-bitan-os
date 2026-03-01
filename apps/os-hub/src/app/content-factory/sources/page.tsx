"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { showToast } from "@/components/Toast";

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

const TYPE_BADGE: Record<string, string> = {
  RSS: "#2563eb",
  API: "#7c3aed",
  SCRAPE: "#d97706",
  MANUAL: "#6b7280",
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

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const [pollingAll, setPollingAll] = useState(false);

  async function fetchSources() {
    try {
      const res = await fetch("/api/content-factory/sources");
      if (!res.ok) throw new Error(`${res.status}`);
      setSources(await res.json());
    } catch (err) {
      showToast({ type: "error", message: `שגיאה בטעינת מקורות: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSources(); }, []);

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/content-factory/sources/seed", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      showToast({ type: "success", message: `נוצרו ${data.created} מקורות, ${data.skipped} קיימים` });
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
    if (!confirm(`למחוק את המקור "${source.name}"?`)) return;
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

  return (
    <div>
      <PageHeader
        title="מקורות תוכן"
        description="ניהול מקורות RSS וסריקה — הזנת רעיונות למפעל התוכן"
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn-secondary"
              onClick={handleDedup}
              disabled={deduping}
              title="מחק מקורות עם URL זהה (שומר את הישן ביותר)"
            >
              {deduping ? "מנקה..." : "נקה כפילויות"}
            </button>
            <button
              className="btn-secondary"
              onClick={handlePollAll}
              disabled={pollingAll}
            >
              {pollingAll ? "סורק..." : "סרוק הכל"}
            </button>
            <button
              className="btn-primary"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? "מעדכן..." : "טען מקורות ברירת מחדל"}
            </button>
          </div>
        }
      />

      {loading && <div style={{ padding: "2rem", textAlign: "center" }}>טוען...</div>}

      {!loading && sources.length === 0 && (
        <EmptyState
          message="אין מקורות עדיין"
          detail="לחצו על ׳טען מקורות ברירת מחדל׳ כדי להתחיל"
        />
      )}

      {!loading && sources.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border-color, #e5e7eb)", textAlign: "right" }}>
              <th style={{ padding: "0.75rem 0.5rem" }}>שם</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>סוג</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>פעיל</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>משקל</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>קטגוריה</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>סריקה אחרונה</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>פריטים</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} style={{ borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>
                  {source.nameHe || source.name}
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#fff",
                      backgroundColor: TYPE_BADGE[source.type] ?? "#6b7280",
                    }}
                  >
                    {source.type}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <button
                    onClick={() => handleToggleActive(source)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "1.2rem",
                    }}
                    title={source.active ? "כבה" : "הפעל"}
                  >
                    {source.active ? "✅" : "⬜"}
                  </button>
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>{source.weight}</td>
                <td style={{ padding: "0.75rem 0.5rem" }}>{source.category ?? "—"}</td>
                <td style={{ padding: "0.75rem 0.5rem" }}>{relativeTime(source.lastPolledAt)}</td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  {source.lastError ? (
                    <span title={source.lastError} style={{ color: "#ef4444", fontSize: "0.75rem", cursor: "help" }}>
                      שגיאה
                    </span>
                  ) : (
                    source.lastItemCount ?? "—"
                  )}
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {source.type === "RSS" && (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                        onClick={() => handlePoll(source.id)}
                        disabled={polling === source.id}
                      >
                        {polling === source.id ? "סורק..." : "סרוק עכשיו"}
                      </button>
                    )}
                    <button
                      style={{
                        background: "none",
                        border: "1px solid #ef4444",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                      }}
                      onClick={() => handleDelete(source)}
                    >
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
