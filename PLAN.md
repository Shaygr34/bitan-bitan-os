# Plan: Clickable Metric Cards + Bulk Acknowledge Bug Fix

## Scope

Two tasks:
1. **Bug fix**: "סמן הכל כנבדק" throws "שגיאה בעדכון חריגים"
2. **Feature**: Make metric cards (מדדים) clickable with drill-down to actual row-level data

---

## Task 1 — Bug Fix: Bulk Acknowledge Error

### Root Cause Analysis

The bulk acknowledge button throws a generic error. Two contributing issues:

1. **Race condition with completion**: The green "ההרצה הושלמה" banner is visible in the screenshot alongside the bulk button. If a user clicks "סמן הרצה כהושלמה" and then immediately clicks "סמן הכל כנבדק" before `fetchRun()` returns, the bulk PATCH hits the `_ensure_not_completed` guard (HTTP 409) but the button was still visible.

2. **Silent error swallowing**: The `catch` block uses bare `catch {}` (no parameter), so the actual error detail (e.g. "ההרצה הושלמה — לא ניתן לבצע שינויים") is lost. The user only sees the generic "שגיאה בעדכון חריגים".

### Fix (3 changes)

| # | File | Change |
|---|------|--------|
| 1a | `runs/[id]/page.tsx` — `doCompleteRun()` | After `fetchRun()` succeeds, also do an **optimistic state update**: `setRun(prev => prev ? { ...prev, status: "completed" } : prev)` immediately after the POST returns. This instantly hides the bulk button and action column. |
| 1b | `runs/[id]/page.tsx` — `bulkAcknowledge()` | Change `catch {}` → `catch (err)` and include the real error: `showToast({ type: "error", message: err instanceof Error ? err.message : "שגיאה בעדכון חריגים" })`. Also propagate the server detail from `!res.ok`: read `await res.json()` to get `detail`. |
| 1c | `runs/[id]/page.tsx` — `patchException()` | Same error-handling improvement for individual exception patching. |

**No backend change needed** — the 409 guard is correct. The fix is purely frontend: faster UI update + better error display.

---

## Task 2 — Clickable Metric Cards with Drill-Down

### Architecture Decision

The data behind each metric lives in two places:
- **Database**: Exception records (for "ללא התאמה" and "נסיגות סטטוס")
- **Output Excel files on volume**: import_output, diff_report, exceptions_report (for "התאמות", "שינויים", "סטטוס → הושלם")

**Decision**: New FastAPI endpoint parses the relevant output XLSX file and returns paginated JSON rows. For exception-based metrics, query the DB directly (already indexed).

### Data Source Mapping

| Metric card | Hebrew label | Data source | What to show |
|-------------|-------------|-------------|-------------|
| `idom_records` | רשומות IDOM | IDOM upload file (RunFile `idom_upload`) | All IDOM input rows |
| `sumit_records` | רשומות SUMIT | SUMIT upload file (RunFile `sumit_upload`) | All SUMIT input rows |
| `matched` | התאמות | Output file `import_output` (Sheet "Import") | All matched records with import data |
| `unmatched` | ללא התאמה | DB Exception table (`no_sumit_match`) | Exception records from DB |
| `changed` | שינויים | Output file `diff_report` (Sheet "Changes") | Field-level changes: מזהה, שם, field, old_value, new_value |
| `status_completed` | סטטוס → הושלם | Output file `diff_report` (Sheet "Status Changes") | Status transition records |
| `regressions` | נסיגות סטטוס | DB Exception table (`status_regression`) | Exception records from DB |

### Implementation Steps

#### Step 2A — Backend: New drill-down endpoint

**File**: `apps/sumit-sync/src/api/routes.py`

New endpoint:
```
GET /runs/{run_id}/drill-down/{metric}?limit=200&offset=0
```

Where `metric` is one of: `idom_records`, `sumit_records`, `matched`, `unmatched`, `changed`, `status_completed`, `regressions`.

Response schema (new in `schemas.py`):
```python
class DrillDownOut(BaseModel):
    metric: str
    total_rows: int
    columns: List[str]
    rows: List[Dict[str, Any]]
```

Logic per metric:
- `unmatched` / `regressions`: Query `models.Exception` by `exception_type`, return as rows. No file parsing.
- `matched`: Find `import_output` file → read Excel sheet "Import" with openpyxl → return rows.
- `changed`: Find `diff_report` file → read sheet "Changes" → return rows.
- `status_completed`: Find `diff_report` file → read sheet "Status Changes" → return rows.
- `idom_records`: Find `idom_upload` file → read with pandas → return rows.
- `sumit_records`: Find `sumit_upload` file → read with pandas → return rows.

**File parsing helper** (in routes.py or new `_parse_xlsx_sheet` helper):
- Use `openpyxl.load_workbook(read_only=True)` for efficiency
- Read header row → column names
- Read data rows → list of dicts
- Apply `limit`/`offset` for pagination
- Return `total_rows` from sheet dimensions

#### Step 2B — Backend: Schema addition

**File**: `apps/sumit-sync/src/api/schemas.py`

Add `DrillDownOut` response model.

#### Step 2C — Next.js proxy route

**File**: `apps/os-hub/src/app/api/sumit-sync/runs/[id]/drill-down/[metric]/route.ts` (new)

Simple GET proxy that forwards to Python `GET /runs/{id}/drill-down/{metric}?limit=…&offset=…`.

#### Step 2D — Frontend: DrillDownDrawer component

**File**: `apps/os-hub/src/components/DrillDownDrawer.tsx` (new)
**File**: `apps/os-hub/src/components/DrillDownDrawer.module.css` (new)

A slide-in drawer (from the left in RTL) that:
- Shows metric name as title
- Displays a data table with the drill-down rows
- Shows row count (e.g., "מציג 200 מתוך 262 שורות")
- Has a close button
- Has a "הורד כקובץ" button that links to the relevant output file download

The drawer uses `<dialog>` element (same pattern as ConfirmDialog) for accessibility.

Table is a standard DLS-styled table with:
- Sortable columns (client-side sort on loaded rows)
- RTL direction
- Token-based styling (no raw values)

#### Step 2E — Frontend: Make MetricCard clickable

**File**: `apps/os-hub/src/app/sumit-sync/runs/[id]/page.tsx`

Changes to the existing `MetricCard` component:
- Add optional `onClick` prop
- Add `cursor: pointer` and hover effect when clickable
- Add a subtle "click to expand" visual indicator

Changes to `RunDetailPage`:
- Add `drillDown` state: `{ metric: string; label: string } | null`
- Each MetricCard gets an `onClick` that sets `drillDown`
- Render `<DrillDownDrawer metric={drillDown.metric} runId={id} label={drillDown.label} onClose={() => setDrillDown(null)} />` when open

#### Step 2F — Frontend: MetricCard CSS

**File**: `apps/os-hub/src/app/sumit-sync/runs/[id]/page.module.css`

Add:
- `.metricCardClickable` — cursor:pointer, hover:border-color change
- Subtle visual indicator (e.g., small expand icon or underline on hover)

#### Step 2G — Tests

**File**: `apps/sumit-sync/tests/test_api.py`

Add test for the drill-down endpoint:
- `test_drill_down_unmatched` — verify returns exception rows
- `test_drill_down_matched` — verify parses import file and returns rows
- `test_drill_down_changed` — verify parses diff report and returns changes

---

## Execution Order

1. **1a–1c**: Bug fix (bulk acknowledge) — ~10 min
2. **2B**: Schema addition — ~2 min
3. **2A**: Backend drill-down endpoint — ~20 min
4. **2C**: Next.js proxy route — ~5 min
5. **2D**: DrillDownDrawer component — ~15 min
6. **2E–2F**: MetricCard clickable + CSS — ~10 min
7. **2G**: Tests — ~10 min
8. **Commit + push**

---

## Files Modified (summary)

| File | Action |
|------|--------|
| `apps/os-hub/src/app/sumit-sync/runs/[id]/page.tsx` | Edit: bug fix + clickable metrics |
| `apps/os-hub/src/app/sumit-sync/runs/[id]/page.module.css` | Edit: clickable card styles |
| `apps/sumit-sync/src/api/routes.py` | Edit: add drill-down endpoint |
| `apps/sumit-sync/src/api/schemas.py` | Edit: add DrillDownOut |
| `apps/os-hub/src/app/api/sumit-sync/runs/[id]/drill-down/[metric]/route.ts` | New: proxy |
| `apps/os-hub/src/components/DrillDownDrawer.tsx` | New: drawer component |
| `apps/os-hub/src/components/DrillDownDrawer.module.css` | New: drawer styles |
| `apps/sumit-sync/tests/test_api.py` | Edit: drill-down tests |

## No changes to

- Database schema / Alembic migrations (no new tables or columns)
- Reconciliation engine (no business logic changes)
- Deployment config (no new env vars or services)
