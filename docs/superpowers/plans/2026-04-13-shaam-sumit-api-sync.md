# Shaam↔Summit API Sync — Frontend Wiring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing backend API-mode execution (`/execute-api`) into the os-hub frontend so users only upload an IDOM file — Summit data is fetched automatically via the API. Make API mode the default, with manual XLSX as fallback.

**Architecture:** The Python backend already has `POST /runs/{id}/execute-api` and `GET /runs/mapping/summary`. We add a Next.js proxy route for each, refactor the `new/page.tsx` wizard to support a mode toggle (API vs manual), and add a mapping status indicator. The `execute-api` endpoint is long-running (3-15 min), so we add a polling mechanism for status during execution.

**Tech Stack:** Next.js 14.2, TypeScript, CSS Modules (design tokens from globals.css), FastAPI backend (Python 3.9)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/os-hub/src/app/api/sumit-sync/runs/[id]/execute-api/route.ts` | **Create** | Proxy route for API-mode execution |
| `apps/os-hub/src/app/api/sumit-sync/runs/mapping/summary/route.ts` | **Create** | Proxy route for mapping store stats |
| `apps/os-hub/src/app/sumit-sync/new/page.tsx` | **Modify** | Add mode toggle, API-only flow, progress polling |
| `apps/os-hub/src/app/sumit-sync/new/page.module.css` | **Modify** | Styles for mode toggle, progress stages |
| `apps/os-hub/src/lib/syncPrefs.ts` | **Modify** | Add `defaultMode` pref (api/manual) |

---

## Chunk 1: Backend Proxy Routes + Prefs

### Task 1: Create execute-api proxy route

**Files:**
- Create: `apps/os-hub/src/app/api/sumit-sync/runs/[id]/execute-api/route.ts`

- [ ] **Step 1: Create the proxy route**

```typescript
import { NextResponse } from "next/server";
import { BASE_URL } from "../../../../proxy";

/** POST /api/sumit-sync/runs/[id]/execute-api → Python POST /runs/{id}/execute-api */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const url = `${BASE_URL}/runs/${id}/execute-api`;
    console.log(`[sumit-sync proxy] POST ${url}`);
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(900_000), // 15 min — API mode is slow
    });
    console.log(`[sumit-sync proxy] ${url} → ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[sumit-sync proxy] Execute-API failed for run ${id}:`, err);
    return NextResponse.json(
      {
        error: "שירות Sumit Sync לא זמין",
        target: `${BASE_URL}/runs/${id}/execute-api`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Verify file is valid TypeScript**

Run: `cd /Users/shay/bitan-bitan-os/apps/os-hub && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new route file

- [ ] **Step 3: Commit**

```bash
git add "apps/os-hub/src/app/api/sumit-sync/runs/[id]/execute-api/route.ts"
git commit -m "feat(sumit-sync): add execute-api proxy route for API-mode execution"
```

---

### Task 2: Create mapping summary proxy route

**Files:**
- Create: `apps/os-hub/src/app/api/sumit-sync/runs/mapping/summary/route.ts`

- [ ] **Step 1: Create the proxy route**

```typescript
import { NextResponse } from "next/server";
import { proxyGet } from "../../../proxy";

/** GET /api/sumit-sync/runs/mapping/summary → Python GET /runs/mapping/summary */
export async function GET() {
  try {
    const res = await proxyGet("/runs/mapping/summary");
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[sumit-sync proxy] Mapping summary failed:", err);
    return NextResponse.json(
      { error: "שירות לא זמין", detail: String(err) },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/os-hub/src/app/api/sumit-sync/runs/mapping/summary/route.ts"
git commit -m "feat(sumit-sync): add mapping summary proxy route"
```

---

### Task 3: Add mode preference to syncPrefs

**Files:**
- Modify: `apps/os-hub/src/lib/syncPrefs.ts`

- [ ] **Step 1: Update SyncPrefs interface and defaults**

Add `defaultMode: "api" | "manual"` to the `SyncPrefs` interface.
Default to `"api"` (the new recommended flow).

```typescript
export interface SyncPrefs {
  defaultYear: number;
  defaultReportType: "financial" | "annual";
  defaultNotes: string;
  defaultMode: "api" | "manual";
}

const DEFAULTS: SyncPrefs = {
  defaultYear: new Date().getFullYear(),
  defaultReportType: "financial",
  defaultNotes: "",
  defaultMode: "api",
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/os-hub/src/lib/syncPrefs.ts
git commit -m "feat(sumit-sync): add defaultMode pref (api/manual) to sync preferences"
```

---

## Chunk 2: Refactor New Run Page — Mode Toggle + API Flow

### Task 4: Refactor new/page.tsx with dual-mode support

**Files:**
- Modify: `apps/os-hub/src/app/sumit-sync/new/page.tsx`
- Modify: `apps/os-hub/src/app/sumit-sync/new/page.module.css`

This is the main task. The page needs:
1. **Mode toggle** on step 1 (config): "אוטומטי (API)" vs "ידני (קבצים)"
2. **API mode**: step 1 (config+mode) → step 2 (upload IDOM only) → step 3 (executing with progress poll)
3. **Manual mode**: step 1 (config+mode) → step 2 (upload IDOM + SUMIT) → step 3 (executing)
4. **Mapping indicator**: show mapping cache status on step 1 (warm/cold affects expected run time)
5. **Long-running poll**: for API mode, poll `GET /runs/{id}` every 10s to detect completion, since the call may time out from the frontend perspective

- [ ] **Step 1: Add CSS for mode toggle and progress stages**

Add to `page.module.css`:

```css
/* Mode toggle */
.modeToggle {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.modeOption {
  flex: 1;
  padding: var(--space-md) var(--space-lg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
  text-align: center;
}

.modeOption:hover {
  border-color: var(--brand-gold);
}

.modeOptionActive {
  border-color: var(--brand-navy);
  background: rgba(27, 42, 74, 0.04);
}

.modeLabel {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  color: var(--text-heading);
  display: block;
  margin-bottom: var(--space-xs);
}

.modeDesc {
  font-size: var(--font-size-xs);
  color: var(--text-caption);
}

.modeRecommended {
  display: inline-block;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  background: var(--status-success-bg);
  color: var(--status-success);
  padding: 2px 6px;
  border-radius: 9999px;
  margin-right: var(--space-xs);
}

/* Mapping indicator */
.mappingIndicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  color: var(--text-caption);
  margin-top: var(--space-md);
}

.mappingWarm {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.mappingCold {
  background: var(--status-warning-bg);
  color: var(--status-warning);
}

/* Progress stages */
.progressStages {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
  max-width: 400px;
}

.progressStage {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--text-caption);
}

.stageActive {
  color: var(--brand-navy);
  font-weight: var(--font-weight-semibold);
}

.stageDone {
  color: var(--status-success);
}

.stageIcon {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

/* Time estimate */
.timeEstimate {
  font-size: var(--font-size-xs);
  color: var(--text-caption);
  text-align: center;
  margin-top: var(--space-md);
}
```

- [ ] **Step 2: Rewrite new/page.tsx with dual-mode logic**

Full replacement of `new/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import { loadSyncPrefs, saveSyncPrefs } from "@/lib/syncPrefs";
import styles from "./page.module.css";

type SyncMode = "api" | "manual";
type Step = "config" | "upload" | "executing" | "error";

interface MappingSummary {
  total_mappings: number;
  with_names: number;
}

export default function NewRunPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("config");
  const [year, setYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState("financial");
  const [mode, setMode] = useState<SyncMode>("api");

  const [runId, setRunId] = useState<string | null>(null);
  const [idomFile, setIdomFile] = useState<File | null>(null);
  const [sumitFile, setSumitFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [progressStage, setProgressStage] = useState(0);

  const [mapping, setMapping] = useState<MappingSummary | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load preferences
  useEffect(() => {
    const prefs = loadSyncPrefs();
    setYear(prefs.defaultYear);
    setReportType(prefs.defaultReportType);
    setMode(prefs.defaultMode || "api");
  }, []);

  // Fetch mapping summary for API mode indicator
  useEffect(() => {
    fetch("/api/sumit-sync/runs/mapping/summary")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setMapping(data); })
      .catch(() => {});
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Save preferences when mode changes
  const handleModeChange = (newMode: SyncMode) => {
    setMode(newMode);
    const prefs = loadSyncPrefs();
    saveSyncPrefs({ ...prefs, defaultMode: newMode });
  };

  async function handleCreateRun() {
    setError(null);
    try {
      const res = await fetch("/api/sumit-sync/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, report_type: reportType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `${res.status}`);
      }
      const run = await res.json();
      setRunId(run.id);
      setStep("upload");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת הרצה");
    }
  }

  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sumit-sync/runs/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "review" || data.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(`/sumit-sync/runs/${id}`);
        } else if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setError("הסנכרון נכשל בשרת");
          setStep("error");
        }
      } catch {
        // Keep polling — transient network error
      }
    }, 10_000);
  }, [router]);

  async function handleUploadAndExecute() {
    if (!runId || !idomFile) return;
    if (mode === "manual" && !sumitFile) return;
    setError(null);
    setStep("executing");
    setProgressStage(0);

    try {
      // Upload IDOM
      setProgress("מעלה קובץ IDOM...");
      setProgressStage(1);
      const idomForm = new FormData();
      idomForm.append("file_role", "idom_upload");
      idomForm.append("file", idomFile);
      const idomRes = await fetch(`/api/sumit-sync/runs/${runId}/upload`, {
        method: "POST",
        body: idomForm,
      });
      if (!idomRes.ok) {
        const data = await idomRes.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "העלאת קובץ IDOM נכשלה");
      }
      setProgressStage(2);

      if (mode === "manual") {
        // Upload SUMIT file
        setProgress("מעלה קובץ SUMIT...");
        const sumitForm = new FormData();
        sumitForm.append("file_role", "sumit_upload");
        sumitForm.append("file", sumitFile!);
        const sumitRes = await fetch(`/api/sumit-sync/runs/${runId}/upload`, {
          method: "POST",
          body: sumitForm,
        });
        if (!sumitRes.ok) {
          const data = await sumitRes.json().catch(() => ({}));
          throw new Error(data.detail || data.error || "העלאת קובץ SUMIT נכשלה");
        }

        // Execute XLSX mode
        setProgress("מריץ סנכרון...");
        setProgressStage(3);
        const execRes = await fetch(`/api/sumit-sync/runs/${runId}/execute`, {
          method: "POST",
        });
        if (!execRes.ok) {
          const data = await execRes.json().catch(() => ({}));
          throw new Error(data.detail || data.error || "הרצת הסנכרון נכשלה");
        }
        router.push(`/sumit-sync/runs/${runId}`);
      } else {
        // Execute API mode — long-running
        setProgress("שולף נתונים מ-Summit CRM...");
        setProgressStage(3);

        // Start polling immediately — the HTTP call may time out
        startPolling(runId);

        try {
          const execRes = await fetch(`/api/sumit-sync/runs/${runId}/execute-api`, {
            method: "POST",
          });
          // If we get a response (didn't timeout), handle it directly
          if (pollRef.current) clearInterval(pollRef.current);

          if (!execRes.ok) {
            const data = await execRes.json().catch(() => ({}));
            throw new Error(data.detail || data.error || "הסנכרון נכשל");
          }
          router.push(`/sumit-sync/runs/${runId}`);
        } catch (fetchErr) {
          // If it's a timeout/network error, the poll will catch completion
          // Only re-throw if polling isn't active
          if (!pollRef.current) {
            throw fetchErr;
          }
          // Otherwise, update progress message and let polling handle it
          setProgress("מחכה לתוצאות... (הסנכרון פועל ברקע)");
          setProgressStage(4);
        }
      }
    } catch (err: unknown) {
      if (pollRef.current) clearInterval(pollRef.current);
      setError(err instanceof Error ? err.message : "התהליך נכשל");
      setStep("error");
    }
  }

  const apiStages = [
    "יצירת הרצה",
    "העלאת קובץ IDOM",
    "שליפת נתונים מ-Summit CRM",
    "התאמה וסנכרון",
    "ממתין לתוצאות...",
  ];

  const manualStages = [
    "יצירת הרצה",
    "העלאת קובץ IDOM",
    "העלאת קובץ SUMIT",
    "התאמה וסנכרון",
  ];

  const stages = mode === "api" ? apiStages : manualStages;
  const isWarm = mapping && mapping.total_mappings > 200;

  return (
    <div>
      <PageHeader title="הרצה חדשה" description="סנכרון נתוני שע״מ עם Summit CRM" />

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>!</span>
          {error}
        </div>
      )}

      {step === "config" && (
        <Card>
          <h2 className={styles.stepTitle}>שלב 1: הגדרות</h2>

          {/* Mode toggle */}
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeOption} ${mode === "api" ? styles.modeOptionActive : ""}`}
              onClick={() => handleModeChange("api")}
            >
              <span className={styles.modeLabel}>
                <span className={styles.modeRecommended}>מומלץ</span>
                אוטומטי (API)
              </span>
              <span className={styles.modeDesc}>
                העלאת קובץ IDOM בלבד — נתוני Summit נשלפים אוטומטית
              </span>
            </button>
            <button
              type="button"
              className={`${styles.modeOption} ${mode === "manual" ? styles.modeOptionActive : ""}`}
              onClick={() => handleModeChange("manual")}
            >
              <span className={styles.modeLabel}>ידני (קבצים)</span>
              <span className={styles.modeDesc}>
                העלאת שני קבצים — IDOM + ייצוא SUMIT ידני
              </span>
            </button>
          </div>

          {/* Mapping status for API mode */}
          {mode === "api" && mapping && (
            <div className={`${styles.mappingIndicator} ${isWarm ? styles.mappingWarm : styles.mappingCold}`}>
              {isWarm
                ? `✓ מטמון לקוחות פעיל (${mapping.total_mappings} לקוחות) — הרצה מהירה (~3-4 דקות)`
                : `מטמון חלקי (${mapping.total_mappings} לקוחות) — הרצה ראשונה עשויה לקחת ~15 דקות`
              }
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="year">שנת מס</label>
              <input
                id="year"
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="reportType">סוג דוח</label>
              <select
                id="reportType"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="financial">דוחות כספיים</option>
                <option value="annual">דוחות שנתיים</option>
              </select>
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreateRun}>
            המשך
          </button>
        </Card>
      )}

      {step === "upload" && (
        <Card>
          <h2 className={styles.stepTitle}>
            שלב 2: {mode === "api" ? "העלאת קובץ IDOM" : "העלאת קבצים"}
          </h2>
          <div className={mode === "manual" ? styles.uploadGrid : undefined}>
            <div className={styles.uploadBox}>
              <label className={styles.uploadLabel} htmlFor="idom-file">
                קובץ IDOM (שע״מ)
              </label>
              <input
                id="idom-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setIdomFile(e.target.files?.[0] ?? null)}
                className={styles.fileInput}
              />
              {idomFile && (
                <span className={styles.fileName}>{idomFile.name}</span>
              )}
            </div>
            {mode === "manual" && (
              <div className={styles.uploadBox}>
                <label className={styles.uploadLabel} htmlFor="sumit-file">
                  קובץ SUMIT (ייצוא)
                </label>
                <input
                  id="sumit-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setSumitFile(e.target.files?.[0] ?? null)}
                  className={styles.fileInput}
                />
                {sumitFile && (
                  <span className={styles.fileName}>{sumitFile.name}</span>
                )}
              </div>
            )}
          </div>
          <button
            className="btn-primary"
            onClick={handleUploadAndExecute}
            disabled={!idomFile || (mode === "manual" && !sumitFile)}
          >
            {mode === "api" ? "העלה והרץ סנכרון אוטומטי" : "העלה והרץ סנכרון"}
          </button>
        </Card>
      )}

      {step === "executing" && (
        <Card>
          <div className={styles.executingState}>
            <div className={styles.spinner} />
            <p className={styles.progressText}>{progress}</p>
            <div className={styles.progressStages}>
              {stages.map((label, i) => {
                const isDone = i < progressStage;
                const isActive = i === progressStage;
                return (
                  <div
                    key={i}
                    className={`${styles.progressStage} ${isActive ? styles.stageActive : ""} ${isDone ? styles.stageDone : ""}`}
                  >
                    <span className={styles.stageIcon}>
                      {isDone ? "✓" : isActive ? "●" : "○"}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>
            {mode === "api" && (
              <p className={styles.timeEstimate}>
                {isWarm
                  ? "זמן משוער: 3-4 דקות"
                  : "זמן משוער: 10-15 דקות (הרצה ראשונה)"
                }
              </p>
            )}
          </div>
        </Card>
      )}

      {step === "error" && (
        <Card>
          <p className={styles.errorRetryText}>ההרצה נכשלה. ניתן לנסות שוב.</p>
          <button
            className="btn-secondary"
            onClick={() => {
              setStep("upload");
              setError(null);
            }}
          >
            חזור להעלאת קבצים
          </button>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type check**

Run: `cd /Users/shay/bitan-bitan-os/apps/os-hub && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Build check**

Run: `cd /Users/shay/bitan-bitan-os/apps/os-hub && npx next build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/os-hub/src/app/sumit-sync/new/page.tsx apps/os-hub/src/app/sumit-sync/new/page.module.css
git commit -m "feat(sumit-sync): dual-mode UI — API (auto) or manual file upload"
```

---

## Chunk 3: Testing & QA

### Task 5: Local end-to-end verification

- [ ] **Step 1: Start the Python backend locally**

```bash
cd /Users/shay/bitan-bitan-os/apps/sumit-sync
source .venv/bin/activate
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify: `curl http://localhost:8000/health` returns 200

- [ ] **Step 2: Start the Next.js frontend locally**

```bash
cd /Users/shay/bitan-bitan-os/apps/os-hub
npm run dev
```

Open `http://localhost:3000/sumit-sync/new` in browser.

- [ ] **Step 3: Verify mode toggle renders correctly**

- [ ] The page loads with API mode selected by default
- [ ] Both mode cards are visible and clickable
- [ ] "מומלץ" badge shows on API mode
- [ ] Mapping status indicator shows below the toggle
- [ ] Switching modes updates the upload step labels

- [ ] **Step 4: Verify API mode upload step**

- Click "המשך" → Step 2 should show IDOM upload only (no SUMIT file input)
- Upload an IDOM file → button enables

- [ ] **Step 5: Verify manual mode upload step**

- Go back, switch to manual mode, click "המשך"
- Step 2 should show both IDOM and SUMIT file inputs
- Button disabled until both files selected

- [ ] **Step 6: Run Python tests**

```bash
cd /Users/shay/bitan-bitan-os/apps/sumit-sync
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: 29 tests pass

- [ ] **Step 7: Commit all changes and push**

```bash
git push origin main
```

### Task 6: Production verification

- [ ] **Step 1: Verify Railway deployment succeeds**

Check Railway dashboard or `railway logs` for successful deploy.

- [ ] **Step 2: Open production OS and navigate to Sumit Sync**

Open the Railway URL and go to `/sumit-sync/new`:
- [ ] Mode toggle renders
- [ ] API mode is default
- [ ] Mapping indicator shows data
- [ ] Upload step shows correctly per mode

- [ ] **Step 3: Test a real run (if IDOM file available)**

Upload an IDOM file and trigger API-mode execution.
Monitor: does the progress stage advance? Does polling detect completion?

---

## Chunk 4: CLAUDE.md Update

### Task 7: Update CLAUDE.md with new capabilities

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the sumit-sync section**

In the "Two Execution Modes" section, add a note about the frontend now supporting both modes:

```markdown
### Frontend Sync Modes (April 2026)
- **API mode (recommended)**: User uploads IDOM file only. Summit data fetched automatically via API.
  - Mapping cache warm (~400 clients): ~3-4 min
  - Mapping cache cold (first run): ~10-15 min
  - Frontend polls `/runs/{id}` every 10s during execution
  - Falls back gracefully if HTTP timeout — polling catches completion
- **Manual mode**: User uploads both IDOM + SUMIT XLSX files. Faster but requires manual export from Summit.
- Mode preference saved to localStorage. API mode is default.
- Proxy routes: `/api/sumit-sync/runs/{id}/execute-api`, `/api/sumit-sync/runs/mapping/summary`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with frontend API sync mode"
```
