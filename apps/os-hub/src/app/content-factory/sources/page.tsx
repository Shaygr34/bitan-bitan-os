"use client";

import { useEffect, useState, useCallback } from "react";
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

type SourceType = "RSS" | "API" | "SCRAPE" | "MANUAL";

const TYPE_BADGE: Record<string, string> = {
  RSS: "#2563eb",
  API: "#7c3aed",
  SCRAPE: "#d97706",
  MANUAL: "#6b7280",
};

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

function errorLabel(err: string): string {
  if (err.includes("403")) return "חסום (403)";
  if (err.includes("timeout")) return "זמן תם";
  if (err.includes("HTML")) return "תגובת HTML";
  if (err.includes("empty")) return "תגובה ריקה";
  return "שגיאה";
}

// ── Inline-edit cell ────────────────────────────────────────────────────────

interface EditCellProps {
  value: string | number;
  type?: "text" | "number" | "select";
  options?: string[];
  displayFn?: (v: string | number) => string;
  onSave: (val: string | number) => void;
}

function EditCell({ value, type = "text", options, displayFn, onSave }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === String(value)) return;
    const next = type === "number" ? parseFloat(trimmed) || value : trimmed;
    onSave(next);
  }, [draft, value, type, onSave]);

  if (editing) {
    if (type === "select" && options) {
      return (
        <select
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          style={{ fontSize: "0.85rem", padding: "0.2rem", border: "1px solid var(--color-accent, #3b82f6)", borderRadius: "4px" }}
        >
          {options.map((o) => (
            <option key={o} value={o}>{CATEGORY_HE[o] ?? o}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        step={type === "number" ? "0.1" : undefined}
        style={{
          width: type === "number" ? "3.5rem" : "100%",
          fontSize: "0.85rem",
          padding: "0.2rem 0.35rem",
          border: "1px solid var(--color-accent, #3b82f6)",
          borderRadius: "4px",
        }}
      />
    );
  }

  const display = displayFn ? displayFn(value) : String(value);

  return (
    <span
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title="לחצו לעריכה"
      style={{ cursor: "pointer", borderBottom: "1px dashed var(--border-color, #d1d5db)" }}
    >
      {display}
    </span>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const [pollingAll, setPollingAll] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState<SourceType>("RSS");
  const [newCategory, setNewCategory] = useState("Tax");
  const [newWeight, setNewWeight] = useState("1.0");
  const [creating, setCreating] = useState(false);

  async function fetchSources(retries = 2) {
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
  }

  useEffect(() => { fetchSources(); }, []);

  // ── Create ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newName.trim() || !newUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/content-factory/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          nameHe: newName.trim(),
          url: newUrl.trim(),
          type: newType,
          category: newCategory,
          weight: parseFloat(newWeight) || 1.0,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      showToast({ type: "success", message: "מקור נוצר" });
      setNewName("");
      setNewUrl("");
      setNewType("RSS");
      setNewCategory("Tax");
      setNewWeight("1.0");
      setShowCreate(false);
      await fetchSources();
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    } finally {
      setCreating(false);
    }
  }

  // ── Inline edit ─────────────────────────────────────────────────────────

  async function handlePatchField(source: Source, field: string, value: unknown) {
    try {
      const res = await fetch(`/api/content-factory/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const updated = await res.json();
      setSources((prev) => prev.map((s) => (s.id === source.id ? updated : s)));
    } catch (err) {
      showToast({ type: "error", message: `שגיאה בעדכון: ${(err as Error).message}` });
    }
  }

  // ── Clear error ─────────────────────────────────────────────────────────

  async function handleClearError(source: Source) {
    try {
      const res = await fetch(`/api/content-factory/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastError: null }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, lastError: null } : s)),
      );
    } catch (err) {
      showToast({ type: "error", message: `שגיאה: ${(err as Error).message}` });
    }
  }

  // ── Existing actions ────────────────────────────────────────────────────

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

  // ── Summary stats ─────────────────────────────────────────────────────

  const activeCount = sources.filter((s) => s.active).length;
  const errorCount = sources.filter((s) => s.lastError).length;
  const rssActiveCount = sources.filter((s) => s.type === "RSS" && s.active).length;

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
              className="btn-secondary"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? "מעדכן..." : "טען ברירת מחדל"}
            </button>
            <button
              className="btn-primary"
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? "בטל" : "הוסף מקור"}
            </button>
          </div>
        }
      />

      {/* Summary bar */}
      {!loading && sources.length > 0 && (
        <div style={{
          display: "flex",
          gap: "1.5rem",
          marginBottom: "1rem",
          padding: "0.75rem 1rem",
          background: "#f9fafb",
          borderRadius: "8px",
          fontSize: "0.85rem",
          color: "var(--color-muted, #666)",
        }}>
          <span>{sources.length} מקורות סה״כ</span>
          <span style={{ color: "#10b981" }}>{activeCount} פעילים</span>
          <span>{rssActiveCount} RSS פעילים</span>
          {errorCount > 0 && (
            <span style={{ color: "#ef4444" }}>{errorCount} שגיאות</span>
          )}
        </div>
      )}

      {/* Create source form */}
      {showCreate && (
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          border: "1px solid var(--border-color, #d1d5db)",
          borderRadius: "8px",
          background: "#f9fafb",
        }}>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>הוספת מקור חדש</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--color-muted, #666)" }}>
                שם
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="למשל: גלובס — מיסים"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--color-muted, #666)" }}>
                כתובת URL
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
                dir="ltr"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--color-muted, #666)" }}>
                סוג
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as SourceType)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              >
                <option value="RSS">RSS</option>
                <option value="API">API</option>
                <option value="SCRAPE">SCRAPE</option>
                <option value="MANUAL">MANUAL</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--color-muted, #666)" }}>
                קטגוריה
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{CATEGORY_HE[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--color-muted, #666)" }}>
                משקל
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--border-color, #d1d5db)",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newUrl.trim()}
                style={{ width: "100%" }}
              >
                {creating ? "יוצר..." : "צור מקור"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <div style={{ padding: "2rem", textAlign: "center" }}>טוען...</div>}

      {!loading && sources.length === 0 && (
        <EmptyState
          message="אין מקורות עדיין"
          detail="לחצו על ׳טען ברירת מחדל׳ או ׳הוסף מקור׳ כדי להתחיל"
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
              <th style={{ padding: "0.75rem 0.5rem" }}>סטטוס</th>
              <th style={{ padding: "0.75rem 0.5rem" }}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr
                key={source.id}
                style={{
                  borderBottom: "1px solid var(--border-color, #e5e7eb)",
                  opacity: source.active ? 1 : 0.55,
                }}
              >
                {/* Name — editable */}
                <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500, maxWidth: "14rem" }}>
                  <EditCell
                    value={source.nameHe || source.name}
                    onSave={(val) => handlePatchField(source, "nameHe", val)}
                  />
                </td>

                {/* Type badge */}
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

                {/* Active toggle */}
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
                    {source.active ? "\u2705" : "\u2B1C"}
                  </button>
                </td>

                {/* Weight — editable */}
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <EditCell
                    value={source.weight}
                    type="number"
                    onSave={(val) => handlePatchField(source, "weight", val)}
                  />
                </td>

                {/* Category — editable dropdown */}
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <EditCell
                    value={source.category ?? "Tax"}
                    type="select"
                    options={CATEGORY_OPTIONS}
                    displayFn={(v) => CATEGORY_HE[String(v)] ?? String(v)}
                    onSave={(val) => handlePatchField(source, "category", val)}
                  />
                </td>

                {/* Last polled */}
                <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.8rem", color: "var(--color-muted, #666)" }}>
                  {relativeTime(source.lastPolledAt)}
                </td>

                {/* Status: error / item count / never polled */}
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  {source.lastError ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <span
                        title={source.lastError}
                        style={{
                          color: "#ef4444",
                          fontSize: "0.75rem",
                          cursor: "help",
                        }}
                      >
                        {errorLabel(source.lastError)}
                      </span>
                      <button
                        onClick={() => handleClearError(source)}
                        title="נקה שגיאה"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#9ca3af",
                          cursor: "pointer",
                          fontSize: "0.7rem",
                          padding: "0",
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : source.lastItemCount !== null ? (
                    <span style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: 500 }}>
                      {source.lastItemCount} פריטים
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-muted, #666)", fontSize: "0.8rem" }}>
                      טרם נסרק
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {(source.type === "RSS" || source.type === "API") && (
                      <button
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                        onClick={() => handlePoll(source.id)}
                        disabled={polling === source.id}
                      >
                        {polling === source.id ? "סורק..." : "סרוק"}
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
