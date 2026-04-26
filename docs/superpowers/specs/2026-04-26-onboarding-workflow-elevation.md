# Onboarding Workflow Elevation — Design Spec

**Date:** April 26, 2026
**Repo:** bitan-bitan-os (apps/os-hub)
**Goal:** Transform the onboarding page from a link generator into a progressive workflow management system where employees manage clients through the full onboarding pipeline with visibility, progress tracking, and actionable checklists.

---

## Architecture

Dashboard-first design. The main page is a pipeline overview showing all in-progress clients. Link creation becomes a quick action (button → modal). Each client row expands on hover and clicks through to a full detail view with stage stepper, documents, and checklist.

Data sources:
- **Sanity** — intake tokens, clientDocuments (uploaded files)
- **Summit CRM** — client entities, statuses, field data (via API)
- **Local state** — checklist progress stored in Sanity (new schema)

No new backend services. OS hub fetches from Sanity + Summit APIs as it does today.

---

## Page Structure

### Navigation
Replace current 2-tab layout with dashboard-first:

| View | Purpose | Access |
|------|---------|--------|
| **לוח בקרה** (default) | Pipeline dashboard — all in-progress clients | Main view |
| **+ לקוח חדש** | Create intake link | Button → modal overlay |
| **השלמת נתונים** | Existing client data completion | Secondary tab (on hold) |

### Dashboard View (לוח בקרה)

**Top bar:**
- Left: `+ לקוח חדש` button (navy, opens modal)
- Right: `{N} לקוחות בתהליך קליטה` count

**Pipeline funnel:** 6 stage cards in a row, each showing count + label:
1. איסוף נתונים (blue)
2. ייפוי כוח (amber)
3. אישור מנהל (green)
4. רשויות (purple)
5. לקוח חדש (cyan)
6. פעיל (green checkmark)

Clicking a stage card filters the table to that stage only.

**Client table:** White card with navy header row.

| Column | Content |
|--------|---------|
| לקוח | Name (14px bold) + type + manager (11px grey) |
| שלב | Status pill (color-coded per stage) |
| התקדמות | Progress bar + percentage |
| תאריך התחלה | DD.M.YY format |
| חסר | Mini-pills: red for missing docs/fields, green "✓ הכל התקבל" when complete |
| פעולות | 💬 WhatsApp, 🔗 Summit, 📋 Detail |

**Row behavior:**
- Left border color matches stage
- Hover: row expands to show phone, email, sector, doc count (X/Y הועלו), days in current stage
- Click: navigates to client detail view

### Client Detail View

**Header:** Back button + client name/type/manager/start date + WhatsApp & Summit buttons

**Stage stepper:** Horizontal 6-dot stepper with connecting lines.
- Completed stages: gold circle with ✓
- Current stage: amber circle with number, subtle glow shadow
- Future stages: grey circle with number
- Progress bar above: gold gradient, percentage displayed

**Two-column layout below stepper:**

**Left column — Info + Documents:**

*Client info card:* 2-column grid showing name, ח.פ/ת.ז, phone, email, sector, address. Read-only display from Summit data.

*Documents card:* Header with count (X/Y). Each doc row:
- Uploaded: green ✓ circle + doc name + "צפה ↗" link (opens Sanity CDN URL)
- Missing: red ! circle + doc name in red + "חסר" badge
- Doc list determined by client type (individual vs company via DOC_FIELDS)

**Right column — Checklist:**

*Checklist card:* Header with count (X/Y) + mini progress bar.

Items organized by relevance to current stage:
- Completed: checked, strikethrough, grey text
- Current/actionable: checkbox enabled, bold text, highlighted background (amber)
- Future: checkbox disabled, grey text, 40% opacity

Checklist items are clickable — checking an item updates the onboarding record.

### + לקוח חדש Modal

Same fields as current (name, client type, manager). Opens as centered modal overlay on the dashboard. On submit: creates intake token, shows link to copy, adds client to dashboard table.

---

## Data Model

### New Sanity Schema: `onboardingRecord`

Tracks per-client checklist progress and workflow state. Created when intake link is generated.

```
onboardingRecord {
  summitEntityId: string        // links to Summit client
  clientName: string            // display name
  clientType: string            // עצמאי/חברה/etc
  accountManager: string        // אבי/רון
  intakeTokenRef: reference     // → intakeToken
  startDate: datetime           // when link was created
  currentStage: number (1-6)    // mirrors Summit status
  checklistItems: array of {
    key: string                 // unique identifier
    label: string               // display text
    completed: boolean
    completedAt: datetime
    completedBy: string         // user who checked it
    stageRelevance: number (1-6) // which stage this belongs to
  }
  notes: text                   // free text for employee notes
}
```

### Checklist Templates

Stored in code (not CMS — they're process definitions, not content). Different template per client type category.

**Base template (all types):**

| Stage | Item | Key |
|-------|------|-----|
| 1 | קליטת נתונים בסיסיים | data-collection |
| 1 | הגדרת מנהל תיק ועדכון הצוות | assign-manager |
| 1 | שליחת קישור קליטה ללקוח | send-link |
| 2 | הפקת ייפוי כוח — מ"ה / מע"מ / ניכויים / ב"ל | power-of-attorney |
| 2 | השלמת מסמכים חסרים | complete-docs |
| 2 | שליחת קודי מוסד ללקוח | send-codes |
| 3 | אישור מנהל תיק | manager-approval |
| 4 | פתיחת תיקים — קבע / ניכויים / הנה"ח / דפי בנק | open-gov-files |
| 4 | מעקב קליטת ייפוי כוח ועדכון דיווחים | track-poa |
| 5 | בקשת ניכוי מס במקור | withholding-request |
| 5 | שליחת תעודת עוסק מורשה | send-osek-cert |
| 6 | שמירת לקוח בנייד המשרדי (WhatsApp) | save-contact |

**Company additions (חברה/שותפות/עמותה):**
- Stage 2: השלמת מסמכי חברה (תעודת התאגדות, תקנון, אישור מורשה חתימה)

**Transfer additions (מעבר מרו"ח):**
- Stage 1: יצירת קשר עם רו"ח קודם לשחרור תיק

On record creation: template items are copied into the `checklistItems` array. Employee can then add custom items or reorder.

### Completion % Calculation

```
completion = (completedChecklist + uploadedDocs) / (totalChecklist + requiredDocs) × 100
```

Where:
- `completedChecklist` = checked items count
- `totalChecklist` = total items in checklist
- `uploadedDocs` = docs with Sanity clientDocument records
- `requiredDocs` = required docs for this client type (from DOC_FIELDS where required=true)

Weighted equally: each checklist item and each required doc counts as 1 unit.

---

## Data Flow

### Dashboard Load
1. Fetch all `onboardingRecord` docs from Sanity (GROQ: `*[_type == "onboardingRecord"]`)
2. For each record, check if matching `intakeToken` is completed (has submittedData)
3. Fetch Summit pipeline data via MCP or direct API for current status counts
4. Compute completion % per client
5. Render pipeline funnel + client table

### Client Detail Load
1. Fetch `onboardingRecord` by summitEntityId
2. Fetch `clientDocument` records for this entity (`*[_type == "clientDocument" && summitEntityId == $id]`)
3. Fetch Summit entity for latest field data (phone, email, etc.)
4. Render stepper + info + docs + checklist

### Checklist Update
1. Employee clicks checkbox → PATCH onboardingRecord in Sanity
2. Update `completed`, `completedAt`, `completedBy` on the item
3. Recompute completion %
4. If all items for current stage complete → prompt to advance Summit status

### Link Creation (Modal)
1. Same flow as current: create intakeToken in Sanity
2. **New:** Also create `onboardingRecord` with template checklist
3. Return link URL
4. Client appears in dashboard immediately (stage 1, 0% progress)

---

## Key Files (Bitan OS — apps/os-hub)

| File | Action |
|------|--------|
| `src/app/onboarding/page.tsx` | **Rewrite** — Dashboard-first layout, pipeline funnel, client table |
| `src/app/onboarding/[entityId]/page.tsx` | **Create** — Client detail view (stepper, info, docs, checklist) |
| `src/app/onboarding/page.module.css` | **Rewrite** — New styles for dashboard, funnel, table, hover |
| `src/app/onboarding/[entityId]/detail.module.css` | **Create** — Detail view styles |
| `src/app/onboarding/components/PipelineFunnel.tsx` | **Create** — 6-stage funnel strip |
| `src/app/onboarding/components/ClientTable.tsx` | **Create** — Table with hover expansion |
| `src/app/onboarding/components/StageStepper.tsx` | **Create** — Horizontal dot stepper |
| `src/app/onboarding/components/ChecklistCard.tsx` | **Create** — Editable checklist with progress |
| `src/app/onboarding/components/DocumentsCard.tsx` | **Create** — Doc status list (uploaded/missing) |
| `src/app/onboarding/components/NewClientModal.tsx` | **Create** — Modal for link creation |
| `src/lib/onboarding/checklist-templates.ts` | **Create** — Template definitions per client type |
| `src/lib/onboarding/completion.ts` | **Create** — Completion % calculator |
| `src/app/api/onboarding/records/route.ts` | **Create** — CRUD for onboardingRecord |
| `src/app/api/onboarding/checklist/route.ts` | **Create** — PATCH checklist item |

### Sanity Schema (bitan-bitan-website repo)
| File | Action |
|------|--------|
| `src/sanity/schemas/onboardingRecord.ts` | **Create** — New schema |
| `src/sanity/schemas/index.ts` | **Modify** — Register schema |

---

## Design Tokens (from existing Design Language System)

- Navy: #1B2A4A (headers, text)
- Gold: #C5A572 (progress bars, accents, completed items)
- Surface: #F8F7F4 (page background)
- Border: #E2E0DB
- Stage colors: blue #3B82F6, amber #F59E0B, green #10B981, purple #8B5CF6, cyan #06B6D4, success #22C55E
- Missing/error: #991B1B on #FEF2F2
- Complete: #065F46 on #D1FAE5
- Font: system-ui (OS app), sizes: 18px headings, 14px names, 13px body, 12px secondary, 11px pills, 10px badges

---

## What This Does NOT Cover

- Summit status auto-advance (future — currently manual via MCP)
- 2Sign API integration (waiting on access)
- Email/SMS reminders for stale clients (separate feature)
- Existing client data completion tab (on hold)
- Drag-and-drop reordering of checklist items (v2 if needed)
