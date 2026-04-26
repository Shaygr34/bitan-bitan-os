# Onboarding Workflow Elevation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Bitan OS onboarding page from a link generator into a progressive workflow management dashboard with pipeline funnel, per-client progress tracking, document status, and actionable checklists.

**Architecture:** Dashboard-first page. Pipeline funnel (6 stages from Summit) at top, client table below with progress bars and hover expansion. Click-through to client detail view with stage stepper, info/docs cards, and editable checklist. Data from Sanity (onboardingRecord, clientDocument, intakeToken) + Summit API (client entity, status). New `onboardingRecord` Sanity schema tracks checklist state per client.

**Tech Stack:** Next.js 14.2, CSS Modules (existing design tokens), Sanity HTTP API (no SDK), Summit CRM direct API, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-26-onboarding-workflow-elevation.md`

**Cross-repo dependency:** Task 1 (Sanity schema) must deploy to bitan-bitan-website FIRST, before OS hub tasks can create onboardingRecord documents.

---

## File Structure

### bitan-bitan-website (Sanity schema only)
| File | Action | Responsibility |
|------|--------|---------------|
| `src/sanity/schemas/onboardingRecord.ts` | Create | Sanity schema for per-client workflow tracking |
| `src/sanity/schemas/index.ts` | Modify | Register new schema |

### bitan-bitan-os (apps/os-hub)
| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/sanity/client.ts` | Modify | Add `patch` mutation helper |
| `src/lib/onboarding/checklist-templates.ts` | Create | Checklist templates per client type |
| `src/lib/onboarding/completion.ts` | Create | Completion % calculator |
| `src/lib/onboarding/summit-client.ts` | Create | Summit API helpers for onboarding data |
| `src/lib/onboarding/types.ts` | Create | Shared TypeScript types |
| `src/app/api/onboarding/records/route.ts` | Create | GET/POST onboardingRecord CRUD |
| `src/app/api/onboarding/checklist/route.ts` | Create | PATCH checklist item |
| `src/app/api/onboarding/pipeline/route.ts` | Create | GET pipeline counts from Summit |
| `src/app/onboarding/page.tsx` | Rewrite | Dashboard-first layout |
| `src/app/onboarding/page.module.css` | Rewrite | Dashboard styles |
| `src/app/onboarding/components/PipelineFunnel.tsx` | Create | 6-stage funnel strip |
| `src/app/onboarding/components/PipelineFunnel.module.css` | Create | Funnel styles |
| `src/app/onboarding/components/ClientTable.tsx` | Create | Client table with hover expansion |
| `src/app/onboarding/components/ClientTable.module.css` | Create | Table styles |
| `src/app/onboarding/components/NewClientModal.tsx` | Create | Modal for link creation |
| `src/app/onboarding/components/NewClientModal.module.css` | Create | Modal styles |
| `src/app/onboarding/[entityId]/page.tsx` | Create | Client detail view |
| `src/app/onboarding/[entityId]/detail.module.css` | Create | Detail view styles |
| `src/app/onboarding/[entityId]/components/StageStepper.tsx` | Create | Horizontal 6-dot stepper |
| `src/app/onboarding/[entityId]/components/ChecklistCard.tsx` | Create | Editable checklist with progress |
| `src/app/onboarding/[entityId]/components/DocumentsCard.tsx` | Create | Doc status list |
| `src/app/onboarding/[entityId]/components/ClientInfoCard.tsx` | Create | Client details grid |

---

## Chunk 1: Foundation (Schema + API Layer)

### Task 1: Create onboardingRecord Sanity schema (bitan-bitan-website repo)

**Files:**
- Create: `/Users/shay/bitan-bitan-website/src/sanity/schemas/onboardingRecord.ts`
- Modify: `/Users/shay/bitan-bitan-website/src/sanity/schemas/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// src/sanity/schemas/onboardingRecord.ts
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'onboardingRecord',
  title: 'רשומת קליטה',
  type: 'document',
  fields: [
    defineField({
      name: 'summitEntityId',
      title: 'Summit Entity ID',
      type: 'string',
      description: 'מזהה הלקוח בסאמיט',
    }),
    defineField({
      name: 'clientName',
      title: 'שם לקוח',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'clientType',
      title: 'סוג לקוח',
      type: 'string',
    }),
    defineField({
      name: 'accountManager',
      title: 'מנהל תיק',
      type: 'string',
    }),
    defineField({
      name: 'intakeToken',
      title: 'טוקן קליטה',
      type: 'string',
      description: 'מזהה הטוקן (לא reference — cross-queried)',
    }),
    defineField({
      name: 'startDate',
      title: 'תאריך התחלה',
      type: 'datetime',
    }),
    defineField({
      name: 'checklistItems',
      title: 'צ\'קליסט',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'key', title: 'מזהה', type: 'string' }),
            defineField({ name: 'label', title: 'תיאור', type: 'string' }),
            defineField({ name: 'completed', title: 'הושלם', type: 'boolean', initialValue: false }),
            defineField({ name: 'completedAt', title: 'תאריך השלמה', type: 'datetime' }),
            defineField({ name: 'stageRelevance', title: 'שלב רלוונטי', type: 'number' }),
          ],
        },
      ],
    }),
    defineField({
      name: 'notes',
      title: 'הערות',
      type: 'text',
    }),
  ],
  preview: {
    select: { title: 'clientName', type: 'clientType', date: 'startDate' },
    prepare({ title, type, date }) {
      const d = date ? new Date(date).toLocaleDateString('he-IL') : ''
      return { title: title || 'ללא שם', subtitle: `${type || ''} · ${d}` }
    },
  },
})
```

- [ ] **Step 2: Register in schema index**

Add `import onboardingRecord from './onboardingRecord'` and add to the schemas array in `src/sanity/schemas/index.ts`.

- [ ] **Step 3: TypeScript check**

Run: `cd /Users/shay/bitan-bitan-website && npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit and push (deploys schema)**

```bash
cd /Users/shay/bitan-bitan-website
git add src/sanity/schemas/onboardingRecord.ts src/sanity/schemas/index.ts
git commit -m "feat: add onboardingRecord Sanity schema for workflow tracking"
git push origin main
```

Wait for Railway deploy to complete before proceeding.

---

### Task 2: Add Sanity patch helper (bitan-bitan-os)

**Files:**
- Modify: `apps/os-hub/src/lib/sanity/client.ts`

- [ ] **Step 1: Add patch function**

Add after the existing `createIfNotExists` function:

```typescript
/**
 * Patch an existing document in Sanity.
 */
export async function patch(
  id: string,
  operations: { set?: Record<string, unknown>; unset?: string[] },
): Promise<{ _id: string }> {
  const { projectId, dataset, apiToken } = sanityConfig;

  if (!projectId || !apiToken) {
    throw new Error("Sanity credentials not configured");
  }

  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      mutations: [{ patch: { id, ...operations } }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Sanity patch failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as SanityMutationResult;
  return { _id: result.results?.[0]?.id ?? id };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/os-hub/src/lib/sanity/client.ts
git commit -m "feat: add Sanity patch mutation helper"
```

---

### Task 3: Create shared types + checklist templates + completion calculator

**Files:**
- Create: `apps/os-hub/src/lib/onboarding/types.ts`
- Create: `apps/os-hub/src/lib/onboarding/checklist-templates.ts`
- Create: `apps/os-hub/src/lib/onboarding/completion.ts`

- [ ] **Step 1: Create types**

```typescript
// apps/os-hub/src/lib/onboarding/types.ts

export interface ChecklistItem {
  _key: string
  key: string
  label: string
  completed: boolean
  completedAt?: string
  stageRelevance: number
}

export interface OnboardingRecord {
  _id: string
  _createdAt: string
  summitEntityId?: string
  clientName: string
  clientType?: string
  accountManager?: string
  intakeToken?: string
  startDate?: string
  checklistItems: ChecklistItem[]
  notes?: string
}

export interface PipelineClient extends OnboardingRecord {
  // Computed at runtime from Summit + Sanity
  currentStage: number
  completionPercent: number
  missingDocs: string[]
  uploadedDocsCount: number
  requiredDocsCount: number
  daysInStage?: number
  summitData?: {
    phone?: string
    email?: string
    sector?: string
    address?: string
  }
}

export const STAGE_LABELS: Record<number, string> = {
  1: 'איסוף נתונים',
  2: 'ייפוי כוח',
  3: 'אישור מנהל',
  4: 'רשויות',
  5: 'לקוח חדש',
  6: 'פעיל',
}

export const STAGE_COLORS: Record<number, string> = {
  1: '#3B82F6',
  2: '#F59E0B',
  3: '#10B981',
  4: '#8B5CF6',
  5: '#06B6D4',
  6: '#22C55E',
}

export const SUMMIT_STATUS_IDS: Record<number, number> = {
  1: 557688551, // איסוף נתונים
  2: 557688550, // ייפוי כוח + מסמכים
  3: 557688552, // אישור מנהל תיק
  4: 1835410276, // פתיחת תיק ממשלתי
  5: 1835414575, // לקוח חדש
  6: 557688549, // לקוח פעיל
}

// Reverse lookup: Summit status entity ID → stage number
export const STATUS_ID_TO_STAGE: Record<number, number> = Object.fromEntries(
  Object.entries(SUMMIT_STATUS_IDS).map(([stage, id]) => [id, Number(stage)])
)

// Required docs per client category
export const REQUIRED_DOCS: Record<string, string[]> = {
  individual: ['idCard', 'driverLicense', 'bankApproval'],
  company: ['idCard', 'driverLicense', 'bankApproval', 'teudatHitagdut'],
  exempt: ['idCard', 'driverLicense'],
}

export function getDocCategory(clientType?: string): 'individual' | 'company' | 'exempt' {
  if (['חברה', 'חברה בע"מ', 'חברה שנתי', 'שותפות', 'עמותה'].includes(clientType || '')) return 'company'
  if (clientType === 'פטור' || clientType === 'עוסק פטור') return 'exempt'
  return 'individual'
}
```

- [ ] **Step 2: Create checklist templates**

```typescript
// apps/os-hub/src/lib/onboarding/checklist-templates.ts

import { type ChecklistItem } from './types'

function item(key: string, label: string, stage: number): ChecklistItem {
  return { _key: key, key, label, completed: false, stageRelevance: stage }
}

const BASE_TEMPLATE: ChecklistItem[] = [
  item('data-collection', 'קליטת נתונים בסיסיים', 1),
  item('assign-manager', 'הגדרת מנהל תיק ועדכון הצוות', 1),
  item('send-link', 'שליחת קישור קליטה ללקוח', 1),
  item('power-of-attorney', 'הפקת ייפוי כוח — מ"ה / מע"מ / ניכויים / ב"ל', 2),
  item('complete-docs', 'השלמת מסמכים חסרים', 2),
  item('send-codes', 'שליחת קודי מוסד ללקוח', 2),
  item('manager-approval', 'אישור מנהל תיק', 3),
  item('open-gov-files', 'פתיחת תיקים — קבע / ניכויים / הנה"ח / דפי בנק', 4),
  item('track-poa', 'מעקב קליטת ייפוי כוח ועדכון דיווחים', 4),
  item('withholding-request', 'בקשת ניכוי מס במקור', 5),
  item('send-osek-cert', 'שליחת תעודת עוסק מורשה', 5),
  item('save-contact', 'שמירת לקוח בנייד המשרדי (WhatsApp)', 6),
]

const COMPANY_EXTRAS: ChecklistItem[] = [
  item('company-docs', 'השלמת מסמכי חברה (תעודת התאגדות, תקנון, אישור מורשה חתימה)', 2),
]

const TRANSFER_EXTRAS: ChecklistItem[] = [
  item('contact-prev-cpa', 'יצירת קשר עם רו"ח קודם לשחרור תיק', 1),
]

export function buildChecklist(clientType?: string, isTransfer?: boolean): ChecklistItem[] {
  const items = [...BASE_TEMPLATE]
  const cat = clientType ? getDocCategory(clientType) : 'individual'
  if (cat === 'company') items.splice(4, 0, ...COMPANY_EXTRAS) // after stage 1 items
  if (isTransfer) items.splice(3, 0, ...TRANSFER_EXTRAS) // end of stage 1
  return items
}

function getDocCategory(clientType: string): string {
  if (['חברה', 'חברה בע"מ', 'חברה שנתי', 'שותפות', 'עמותה'].includes(clientType)) return 'company'
  if (clientType === 'פטור' || clientType === 'עוסק פטור') return 'exempt'
  return 'individual'
}
```

- [ ] **Step 3: Create completion calculator**

```typescript
// apps/os-hub/src/lib/onboarding/completion.ts

import { type ChecklistItem } from './types'

export function calculateCompletion(
  checklistItems: ChecklistItem[],
  uploadedDocsCount: number,
  requiredDocsCount: number,
): number {
  const checkedCount = checklistItems.filter(i => i.completed).length
  const totalUnits = checklistItems.length + requiredDocsCount
  const completedUnits = checkedCount + uploadedDocsCount
  if (totalUnits === 0) return 0
  return Math.round((completedUnits / totalUnits) * 100)
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/os-hub/src/lib/onboarding/
git commit -m "feat: onboarding types, checklist templates, completion calculator"
```

---

### Task 4: Create API routes (records, checklist, pipeline)

**Files:**
- Create: `apps/os-hub/src/lib/onboarding/summit-client.ts`
- Create: `apps/os-hub/src/app/api/onboarding/records/route.ts`
- Create: `apps/os-hub/src/app/api/onboarding/checklist/route.ts`
- Create: `apps/os-hub/src/app/api/onboarding/pipeline/route.ts`

- [ ] **Step 1: Create Summit client helper**

```typescript
// apps/os-hub/src/lib/onboarding/summit-client.ts

const BASE_URL = 'https://api.sumit.co.il'

function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
}

export async function getSummitEntity(entityId: string): Promise<Record<string, unknown> | null> {
  const creds = getCredentials()
  if (!creds.APIKey) return null

  try {
    const res = await fetch(`${BASE_URL}/crm/data/getentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        EntityID: parseInt(entityId, 10),
        Folder: '557688522',
      }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json.Status !== 0) return null
    return json.Data?.Entity ?? null
  } catch {
    return null
  }
}

export function extractStageFromEntity(entity: Record<string, unknown>): number {
  const status = entity['Customers_Status'] as Array<{ ID: number }> | undefined
  if (!status?.[0]?.ID) return 0
  // Import STATUS_ID_TO_STAGE at runtime to avoid circular deps
  const { STATUS_ID_TO_STAGE } = require('./types')
  return STATUS_ID_TO_STAGE[status[0].ID] ?? 0
}

export function extractClientData(entity: Record<string, unknown>) {
  return {
    phone: (entity['Customers_Phone'] as string[])?.[0] ?? '',
    email: (entity['Customers_EmailAddress'] as string[])?.[0] ?? '',
    sector: (entity['תחום עיסוק'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    address: (entity['Customers_Address'] as string[])?.[0] ?? '',
  }
}
```

- [ ] **Step 2: Create records route (GET all, POST create)**

```typescript
// apps/os-hub/src/app/api/onboarding/records/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { query, createOrReplace } from '@/lib/sanity/client'
import { buildChecklist } from '@/lib/onboarding/checklist-templates'

export const dynamic = 'force-dynamic'

export async function GET() {
  const records = await query<unknown[]>(
    `*[_type == "onboardingRecord"] | order(startDate desc) {
      _id, _createdAt, summitEntityId, clientName, clientType,
      accountManager, intakeToken, startDate, checklistItems, notes
    }`
  )
  return NextResponse.json({ records })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clientName, clientType, accountManager, intakeToken, summitEntityId } = body

  if (!clientName) {
    return NextResponse.json({ error: 'clientName required' }, { status: 400 })
  }

  const isTransfer = (body.onboardingPath || '').includes('transfer')
  const checklist = buildChecklist(clientType, isTransfer)

  const doc = {
    _id: `onboarding-${intakeToken || Date.now()}`,
    _type: 'onboardingRecord',
    clientName,
    clientType: clientType || undefined,
    accountManager: accountManager || undefined,
    intakeToken: intakeToken || undefined,
    summitEntityId: summitEntityId || undefined,
    startDate: new Date().toISOString(),
    checklistItems: checklist,
  }

  const result = await createOrReplace(doc)
  return NextResponse.json({ record: { ...doc, _id: result._id } })
}
```

- [ ] **Step 3: Create checklist PATCH route**

```typescript
// apps/os-hub/src/app/api/onboarding/checklist/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { recordId, itemKey, completed } = body

  if (!recordId || !itemKey || typeof completed !== 'boolean') {
    return NextResponse.json({ error: 'recordId, itemKey, completed required' }, { status: 400 })
  }

  // Fetch current record to find the item index
  const record = await query<{ checklistItems: Array<{ _key: string }> }>(
    `*[_type == "onboardingRecord" && _id == $id][0]{ checklistItems }`,
    { id: recordId }
  )

  if (!record?.checklistItems) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const idx = record.checklistItems.findIndex(i => i._key === itemKey)
  if (idx === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const setOps: Record<string, unknown> = {
    [`checklistItems[${idx}].completed`]: completed,
  }
  if (completed) {
    setOps[`checklistItems[${idx}].completedAt`] = new Date().toISOString()
  }

  await patch(recordId, { set: setOps })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create pipeline route (Summit status counts)**

```typescript
// apps/os-hub/src/app/api/onboarding/pipeline/route.ts

import { NextResponse } from 'next/server'
import { SUMMIT_STATUS_IDS } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://api.sumit.co.il'

export async function GET() {
  const creds = {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }

  if (!creds.APIKey) {
    return NextResponse.json({ error: 'Summit not configured' }, { status: 500 })
  }

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }

  for (const [stage, statusId] of Object.entries(SUMMIT_STATUS_IDS)) {
    try {
      const res = await fetch(`${BASE_URL}/crm/data/listentities/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
        body: JSON.stringify({
          Credentials: creds,
          Folder: '557688522',
          Filters: [{ Property: 'Customers_Status', Value: statusId }],
          Paging: { StartIndex: 0, PageSize: 1 },
        }),
        cache: 'no-store',
      })
      if (res.ok) {
        const json = await res.json()
        // HasNextPage + entities length gives us approximate count
        const entities = json.Data?.Entities ?? []
        const hasNext = json.Data?.HasNextPage ?? false
        counts[Number(stage)] = hasNext ? entities.length + 1 : entities.length
      }
    } catch { /* skip on error */ }
  }

  return NextResponse.json({ counts })
}
```

- [ ] **Step 5: TypeScript check**

Run: `cd /Users/shay/bitan-bitan-os && npx tsc --noEmit --pretty`

- [ ] **Step 6: Commit**

```bash
git add apps/os-hub/src/lib/onboarding/ apps/os-hub/src/app/api/onboarding/
git commit -m "feat: onboarding API layer — records, checklist, pipeline, Summit client"
```

---

## Chunk 2: Dashboard UI

### Task 5: Pipeline Funnel component

**Files:**
- Create: `apps/os-hub/src/app/onboarding/components/PipelineFunnel.tsx`
- Create: `apps/os-hub/src/app/onboarding/components/PipelineFunnel.module.css`

Build the 6-stage funnel strip as designed in mockup V4. Each card: white background, colored bottom border, count number (22px bold), stage label (10px). Clicking a stage calls `onFilterStage(stageNumber)`. Active filter gets subtle highlight.

Use CSS vars from `globals.css` where possible. Stage colors defined in `types.ts`.

- [ ] **Step 1: Create component + CSS module**
- [ ] **Step 2: Commit**

---

### Task 6: Client Table component with hover expansion

**Files:**
- Create: `apps/os-hub/src/app/onboarding/components/ClientTable.tsx`
- Create: `apps/os-hub/src/app/onboarding/components/ClientTable.module.css`

Table from mockup V4. Navy header, rows with: client name (14px bold) + type/manager subtitle, status pill (colored per stage), progress bar + %, start date (DD.M.YY), missing items as red pills or green "✓ הכל התקבל", action icons (WhatsApp, Summit, detail). Left border colored per stage.

Hover: row expands to show phone, email, sector, doc count, days in stage. CSS transition `max-height` + `opacity`.

Click row (not action icons): navigate to `/onboarding/{entityId}`.

Props: `clients: PipelineClient[]`, `onNavigate: (entityId: string) => void`.

- [ ] **Step 1: Create component + CSS module**
- [ ] **Step 2: Commit**

---

### Task 7: New Client Modal component

**Files:**
- Create: `apps/os-hub/src/app/onboarding/components/NewClientModal.tsx`
- Create: `apps/os-hub/src/app/onboarding/components/NewClientModal.module.css`

Centered modal overlay. Same fields as current link creation (client name, client type dropdown, manager dropdown). On submit: calls POST `/api/intake/generate` (existing) + POST `/api/onboarding/records` (new). Shows generated link with copy button. Modal closes on backdrop click or success.

- [ ] **Step 1: Create component + CSS module**
- [ ] **Step 2: Commit**

---

### Task 8: Rewrite main onboarding page

**Files:**
- Rewrite: `apps/os-hub/src/app/onboarding/page.tsx`
- Rewrite: `apps/os-hub/src/app/onboarding/page.module.css`

Dashboard-first layout:
1. Top bar: `+ לקוח חדש` button (top-right) + client count (top-left)
2. PipelineFunnel (fetches from `/api/onboarding/pipeline`)
3. ClientTable (fetches onboardingRecords from `/api/onboarding/records`, enriches with Summit data per client via `/api/onboarding/pipeline`)
4. Keep CompletionDashboard as secondary tab (existing, unchanged)
5. NewClientModal (toggled by button)

Data loading: `useEffect` on mount fetches records + pipeline counts. For Summit enrichment (stage, phone, email per client), batch-fetch via a new API route or client-side calls. Start with per-record Summit fetch (paginated, with loading states).

- [ ] **Step 1: Rewrite page.tsx with all components wired**
- [ ] **Step 2: Rewrite page.module.css**
- [ ] **Step 3: TypeScript check**
- [ ] **Step 4: Commit**

---

## Chunk 3: Client Detail View

### Task 9: Stage Stepper component

**Files:**
- Create: `apps/os-hub/src/app/onboarding/[entityId]/components/StageStepper.tsx`

Horizontal 6-dot stepper with connecting lines. Props: `currentStage: number`, `completionPercent: number`. Completed = gold ✓, current = amber with glow, future = grey. Progress bar + % above the dots.

- [ ] **Step 1: Create component**
- [ ] **Step 2: Commit**

---

### Task 10: ClientInfoCard, DocumentsCard, ChecklistCard

**Files:**
- Create: `apps/os-hub/src/app/onboarding/[entityId]/components/ClientInfoCard.tsx`
- Create: `apps/os-hub/src/app/onboarding/[entityId]/components/DocumentsCard.tsx`
- Create: `apps/os-hub/src/app/onboarding/[entityId]/components/ChecklistCard.tsx`

**ClientInfoCard:** 2-column grid from Summit data. Read-only.

**DocumentsCard:** Fetches clientDocument records from Sanity for this summitEntityId. Shows each required doc as uploaded (green ✓ + צפה link) or missing (red ! + חסר badge). Header shows X/Y count.

**ChecklistCard:** Renders checklistItems from onboardingRecord. Mini progress bar (X/Y). Completed = strikethrough grey. Current stage items = bold, highlighted amber background, clickable checkbox. Future = disabled, 40% opacity. On check: PATCH `/api/onboarding/checklist`.

Employee can add custom items via "+ משימה" input at bottom.

- [ ] **Step 1: Create all three components**
- [ ] **Step 2: Commit**

---

### Task 11: Client detail page

**Files:**
- Create: `apps/os-hub/src/app/onboarding/[entityId]/page.tsx`
- Create: `apps/os-hub/src/app/onboarding/[entityId]/detail.module.css`

Assembles: back button + header → StageStepper → two-column layout (ClientInfoCard + DocumentsCard | ChecklistCard).

Fetches: onboardingRecord from Sanity, clientDocuments from Sanity, Summit entity for live stage + client data.

- [ ] **Step 1: Create page + CSS**
- [ ] **Step 2: TypeScript check**
- [ ] **Step 3: Commit**

---

## Chunk 4: Integration + Polish

### Task 12: Wire link creation to create onboardingRecord

**Files:**
- Modify: `apps/os-hub/src/app/api/intake/generate/route.ts`

After creating the intakeToken, also create an onboardingRecord via the Sanity client. Pass clientName, clientType, accountManager, intakeToken.

- [ ] **Step 1: Add onboardingRecord creation to generate route**
- [ ] **Step 2: Commit**

---

### Task 13: Full integration test + visual QA

- [ ] **Step 1: Create a test intake link via OS**
- [ ] **Step 2: Verify onboardingRecord appears in Sanity**
- [ ] **Step 3: Verify dashboard shows the new client with correct stage**
- [ ] **Step 4: Click through to detail view — verify stepper, info, docs, checklist**
- [ ] **Step 5: Check a checklist item — verify it persists on reload**
- [ ] **Step 6: Verify hover expansion on dashboard table**
- [ ] **Step 7: Clean up test data**

---

### Task 14: Push to production

- [ ] **Step 1: Final TypeScript check**
- [ ] **Step 2: Commit any remaining fixes**
- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Verify Railway deployment**
