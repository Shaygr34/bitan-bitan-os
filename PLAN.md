# Plan: Full Hebrew Translation + Status Regression Rows

## Context

Drill-down feature works well. Two remaining issues:
1. **Status regression drill-down** needs to show per-record rows (already fixed in engine + routes for *new* runs; old runs with summary-only data will show the summary)
2. **English text everywhere** — Excel output sheets, diff report labels, warning messages all still in English

---

## Changes

### 1. `output_writer.py` — Translate Excel sheet names + labels

**Sheet names** (used in diff report and exceptions report):

| Current (English) | New (Hebrew) |
|---|---|
| `"Import"` (import file) | `"ייבוא"` |
| `"Summary"` (diff report) | `"סיכום"` |
| `"Changes"` | `"שינויים"` |
| `"Status Changes"` | `"שינויי סטטוס"` |
| `"Extension Updates"` | `"עדכוני ארכה"` |
| `"Warnings"` | `"אזהרות"` |
| `"Unmatched"` (exceptions report) | `"ללא התאמה"` |
| `"Status Review"` | `"סקירת סטטוס"` |
| `"Summary"` (exceptions report) | `"סיכום"` |

**Diff report summary sheet** (`_write_summary_sheet`):

| Current | New |
|---|---|
| `"IDOM → SUMIT Sync Report"` | `"דו״ח סנכרון IDOM → SUMIT"` |
| `"Report Type: "` | `"סוג דו״ח: "` |
| `"Tax Year: "` | `"שנת מס: "` |
| `"Generated: "` | `"נוצר: "` |
| `"Processing Statistics"` | `"סטטיסטיקת עיבוד"` |
| `"Total IDOM Records"` | `"רשומות IDOM"` |
| `"Total SUMIT Records"` | `"רשומות SUMIT"` |
| `"Match Results"` | `"תוצאות התאמה"` |
| `"Matched"` | `"התאמות"` |
| `"Unmatched (Exceptions)"` | `"ללא התאמה (חריגים)"` |
| `"Match Rate"` | `"אחוז התאמה"` |
| `"Update Statistics"` | `"סטטיסטיקת עדכונים"` |
| `"Records Changed"` | `"רשומות שהשתנו"` |
| `"Records Unchanged"` | `"רשומות ללא שינוי"` |
| `"Status → Completed"` | `"סטטוס → הושלם"` |
| `"Status Preserved"` | `"סטטוס נשמר"` |
| `"Status Regression Flags"` | `"נסיגות סטטוס"` |
| `"Warnings"` (section header) | `"אזהרות"` |

**Empty-state strings**:

| Current | New |
|---|---|
| `"No changes recorded"` | `"לא נרשמו שינויים"` |
| `"No warnings"` | `"אין אזהרות"` |
| `"No data"` / `"No data ({title})"` | `"אין נתונים"` / `"אין נתונים ({title})"` |
| `"Unmatched IDOM Records"` (title) | `"רשומות IDOM ללא התאמה"` |
| `"Changes"` (passed to _write_dataframe_sheet) | `"שינויים"` |

### 2. `routes.py` — Update `METRIC_FILE_MAP` sheet names

The drill-down endpoint reads Excel sheets by name. Must match the new Hebrew sheet names:

| Metric | Old sheet | New sheet |
|---|---|---|
| `matched` | `"Import"` | `"ייבוא"` |
| `changed` | `"Changes"` | `"שינויים"` |
| `status_completed` | `"Status Changes"` | `"שינויי סטטוס"` |

### 3. `sync_engine.py` — Translate warning messages

| Current | New |
|---|---|
| `"Secondary match for {key} → {sk} (leading zeros)"` | `"התאמה משנית עבור {key} → {sk} (אפסים מובילים)"` |
| `"⚠️ {n} IDOM records had no SUMIT match..."` | `"⚠️ {n} רשומות IDOM ללא התאמה ב-SUMIT. ייתכן ייצוא SUMIT חלקי/מסונן, או לקוחות חדשים."` |

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/sumit-sync/src/core/output_writer.py` | All sheet names, stats labels, empty-state messages → Hebrew |
| `apps/sumit-sync/src/core/sync_engine.py` | Warning messages → Hebrew |
| `apps/sumit-sync/src/api/routes.py` | `METRIC_FILE_MAP` sheet names → Hebrew |

## No changes to

- Frontend (no English visible in the UI — all client-side labels already Hebrew)
- Database schema
- Deployment config
