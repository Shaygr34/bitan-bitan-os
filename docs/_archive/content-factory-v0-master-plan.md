# Content Factory v0 — Master Plan

**System:** Bitan & Bitan OS Hub (`bitan-bitan-os`)  
**Author:** Claude Opus (Lead Architect)  
**Date:** 2026-03-01  
**Status:** Implementation-Ready  
**Audience:** Shay (Product Owner), Claude Code (Implementer)

---

## Executive Summary

Content Factory v0 ships the smallest real loop that produces published posts on the Bitan & Bitan website through Sanity CMS. The pipeline: **RSS Sources → Ideas → Score → AI Draft → Human Approval → Publish to Sanity.**

The codebase already has a solid foundation — 8 Prisma models, 14 enums, working state machines (42 tests), full Article CRUD + approval flows, and EventLog audit trail. What's missing is everything upstream (nothing feeds content in automatically) and one downstream piece (Sanity push). This plan adds exactly those pieces in 10 PRs.

**What v0 delivers:** Partners open the Founder Console, see a ranked list of high-relevance ideas pulled from Israeli tax/business RSS feeds, click "Generate Draft" on the best ones, review the AI-generated Hebrew article, approve it, and click "Publish to Website" — which pushes a complete blog post to the Sanity-powered public site. Total partner time per article: ~2 minutes.

**What v0 does NOT do:** Multi-channel publishing (no email, no social, no PDF generation from articles), analytics, scheduling/queue infrastructure, or embedding-based de-duplication.

---

## 1. Pipeline Architecture (v0)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CONTENT FACTORY v0 PIPELINE                              │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────────┤
│   CF1    │   CF2    │  CF3/4   │   CF5    │   CF7    │   CF8    │   WEBSITE     │
│  Source  │  Ingest  │ Dedup +  │    AI    │  Human   │ Publish  │  (Sanity →    │
│ Registry │  (RSS)   │  Score   │  Draft   │ Approval │ to CMS   │   Public)     │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────────┤
│ Source   │ RSS poll │ URL hash │ Claude   │ Existing │ @sanity/ │ Already live  │
│ model +  │ → Idea   │ + title  │ Sonnet 4 │ approval │ client   │ ~80% ready    │
│ seed 10  │ records  │ fuzzy +  │ → Hebrew │ workflow │ write    │               │
│ sources  │          │ weighted │ article  │ + UI     │ API      │               │
│          │          │ score    │ draft    │          │          │               │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────────┤
│ NEW      │ NEW      │ NEW      │ NEW      │ EXISTS   │ NEW      │ EXISTS        │
│ model    │ service  │ service  │ service  │ ✅ done  │ client   │ (needs schema │
│          │          │          │          │          │          │  mapping)     │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴───────────────┘
```

### Pipeline Boundary: Upstream vs. Downstream

| Boundary | Stages | Tolerance | Rule |
|----------|--------|-----------|------|
| **Upstream** (intelligence) | CF1–CF5 | Experimentation OK | Can be wrong, can retry, can learn |
| **Downstream** (operations) | CF7–CF8 | Determinism required | Must be predictable, auditable, reversible |
| **Approval gate** (CF7) | The boundary | Zero tolerance for bypass | Nothing reaches downstream without explicit human action |

---

## 2. Data Model

### 2.1 What Exists (Do Not Modify)

These models are deployed and tested. v0 builds on top of them, not around them.

| Model | Fields (key) | Status |
|-------|-------------|--------|
| **Idea** | id, title, description, sourceType (MANUAL/RSS/SCRAPE/TREND), sourceUrl, status (NEW/SELECTED/ENRICHED/REJECTED/ARCHIVED), tags[], priority | Deployed, orphaned (zero routes/UI) |
| **Article** | id, ideaId?, title, subtitle, bodyBlocks (JSON), editorialStatus (DRAFT/IN_REVIEW/APPROVED/ARCHIVED), distributionStatus, version, tags[], category | Deployed, full CRUD + transitions |
| **Asset** | id, articleId, platform, type, editorialStatus, content (JSON), version | Deployed |
| **Approval** | id, entityType, entityId, action (APPROVED/REVISION_REQUESTED), comment, createdById | Deployed |
| **PublishJob** | id, assetId, connector, status (PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELLED), method (MANUAL/ZAPIER_BUFFER/RESEND/WEBSITE_DIRECT), externalId, externalUrl, result (JSON) | Deployed |
| **AIProposal** | id, entityType, entityId, primitive (SUGGEST/REWRITE_SELECTION/GENERATE_VARIANTS), input (JSON), output (JSON), outcome (PENDING/ACCEPTED/REJECTED/EXPIRED), tokenUsage (JSON) | Deployed, unused |
| **EventLog** | id, actorType, actorId, entityType, entityId, action, before (JSON), after (JSON), metadata (JSON) | Deployed, used in transitions |
| **Artifact** | id, articleId, filePath, fileType, fileSize | Deployed |

### 2.2 What's New (v0 Additions)

**Only ONE new Prisma model:** `Source`

```prisma
model Source {
  id                String   @id @default(uuid())
  name              String                          // "כלכליסט — מיסים" or "Calcalist Tax"
  nameHe            String?                         // Hebrew name if name is English
  type              SourceType @default(RSS)        // RSS | API | SCRAPE | MANUAL
  url               String                          // Feed URL or page URL
  active            Boolean  @default(true)
  weight            Float    @default(1.0)          // 0.5–2.0, used in scoring
  category          String?                         // "Tax", "Payroll", "Legal", etc.
  tags              String[] @default([])           // ["income-tax", "VAT", "compliance"]
  pollIntervalMin   Int      @default(60)           // minutes between polls
  lastPolledAt      DateTime?
  lastItemCount     Int?                            // items found in last poll
  lastError         String?                         // last poll error message
  notes             String?                         // implementation notes
  
  // Relations
  ideas             Idea[]                          // Ideas sourced from this feed
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([active])
  @@index([type])
}

enum SourceType {
  RSS
  API
  SCRAPE
  MANUAL
}
```

**Idea model modifications** (add fields to existing model):

```prisma
// ADD to existing Idea model:
  sourceId          String?                         // FK → Source
  source            Source?  @relation(fields: [sourceId], references: [id])
  fingerprint       String?                         // normalized title hash for dedup
  score             Float?                          // relevance score (0–100)
  scoreBreakdown    Json?                           // { sourceWeight, recency, keywordMatch, ... }
  sourcePublishedAt DateTime?                       // when the original article was published

  @@index([fingerprint])
  @@index([score])
  @@index([sourceId])
```

**Article model modifications** (add fields to existing model):

```prisma
// ADD to existing Article model:
  seoTitle          String?                         // SEO-optimized title (may differ from title)
  seoDescription    String?                         // Meta description
  slug              String?                         // URL slug for website
  sanityId          String?                         // Sanity document _id after publish
  sanityUrl         String?                         // Live website URL after publish
  aiGenerated       Boolean  @default(false)        // Whether this was AI-drafted
  
  @@unique([slug])
  @@index([sanityId])
```

### 2.3 State Machine (v0 Path)

The happy path through v0 uses existing state machines with no modifications:

```
Idea: NEW ──[select]──> SELECTED ──[generate draft]──> ENRICHED
                                                          │
Article: ◀── created with DRAFT status ──────────────────┘
         DRAFT ──[submit]──> IN_REVIEW ──[approve]──> APPROVED
                                                         │
Asset:   ◀── WEBSITE asset auto-created ────────────────┘
         DRAFT ──[submit]──> IN_REVIEW ──[approve]──> APPROVED
                                                         │
PublishJob: ◀── WEBSITE_DIRECT ─────────────────────────┘
            PENDING ──> IN_PROGRESS ──> SUCCEEDED (Sanity push complete)
```

**Simplification for v0:** When an article is approved and "Publish to Website" is clicked, the system auto-creates a WEBSITE Asset (if none exists), auto-approves it, and executes the Sanity publish — all in one action. This avoids forcing the partner through Asset-level approval for v0 when there's only one channel.

---

## 3. Scoring Rubric v0

Score range: 0–100. Computed deterministically. Stored with breakdown for transparency.

### Formula

```
score = (sourceWeight × 25) + (recencyScore × 25) + (keywordScore × 30) + (categoryBonus × 20)
```

### Components

| Component | Weight | Logic | Range |
|-----------|--------|-------|-------|
| **Source Weight** | 25% | `source.weight` normalized to 0–25. Weight 2.0 → 25, weight 0.5 → 6.25 | 0–25 |
| **Recency** | 25% | Hours since published. <6h → 25, <24h → 20, <48h → 15, <7d → 10, >7d → 5 | 5–25 |
| **Keyword Match** | 30% | Count of matched keywords from domain buckets (see below). Normalized: ≥3 matches → 30, 2 → 20, 1 → 10, 0 → 0 | 0–30 |
| **Category Bonus** | 20% | If source.category matches a "priority category": +20. Priority: Tax, Payroll, Regulation. Standard: Legal, Grants. Low: Business-News, Markets | 0–20 |

### Keyword Buckets (Hebrew + English)

```json
{
  "tax_core": ["מס הכנסה", "מע\"מ", "מס חברות", "ניכוי במקור", "שומה", "החזר מס", 
               "עוסק מורשה", "עוסק פטור", "תיאום מס", "הצהרת הון",
               "income tax", "VAT", "corporate tax", "withholding"],
  "payroll": ["שכר", "משכורת", "תלוש", "ביטוח לאומי", "פנסיה", "קרן השתלמות",
              "פיצויים", "דמי הבראה", "שעות נוספות", "payroll", "NII"],
  "compliance": ["דיווח", "חוזר מקצועי", "הוראת שעה", "תקנות", "הוראת ביצוע",
                 "רשות המסים", "טופס", "הגשה", "מועד אחרון", "filing deadline"],
  "real_estate": ["מס שבח", "מס רכישה", "נדל\"ן", "מקרקעין", "היטל השבחה",
                  "real estate tax", "betterment levy"],
  "grants": ["מענק", "סיוע", "הלוואה", "רשות החדשנות", "עסק קטן",
             "grant", "innovation authority", "small business"],
  "legal": ["פסק דין", "בית משפט", "ערעור", "תקדים", "חקיקה",
            "court ruling", "precedent", "legislation"]
}
```

### Score Display (UI)

Each idea shows its score with a one-line explanation:

```
Score: 82/100
📊 Source: Calcalist Tax (2.0) • Published: 3h ago • Keywords: מע"מ, חוזר מקצועי, דיווח • Category: Tax ★
```

---

## 4. Source Registry Seed (Top 10)

```json
[
  {
    "name": "כלכליסט — מיסים",
    "nameHe": "כלכליסט — מיסים",
    "type": "RSS",
    "url": "http://www.calcalist.co.il/GeneralRSS/0,16335,L-13,00.xml",
    "weight": 1.5,
    "category": "Tax",
    "tags": ["income-tax", "VAT", "real-estate-tax", "corp-tax", "court-ruling"],
    "pollIntervalMin": 60,
    "notes": "Dedicated tax RSS feed from Calcalist. Hebrew. Headlines + summary."
  },
  {
    "name": "כלכליסט — משפט",
    "nameHe": "כלכליסט — משפט",
    "type": "RSS",
    "url": "http://www.calcalist.co.il/GeneralRSS/0,16335,L-7,00.xml",
    "weight": 1.3,
    "category": "Legal",
    "tags": ["court-ruling", "compliance", "enforcement"],
    "pollIntervalMin": 60,
    "notes": "Law/Legal feed from Calcalist. Court rulings, regulatory enforcement."
  },
  {
    "name": "כלכליסט — נדל\"ן",
    "nameHe": "כלכליסט — נדל\"ן",
    "type": "RSS",
    "url": "http://www.calcalist.co.il/GeneralRSS/0,16335,L-9,00.xml",
    "weight": 1.2,
    "category": "Tax",
    "tags": ["real-estate-tax", "compliance"],
    "pollIntervalMin": 120,
    "notes": "Real estate feed. Relevant for מס שבח, מס רכישה content."
  },
  {
    "name": "גלובס — דין וחשבון",
    "nameHe": "גלובס — דין וחשבון",
    "type": "RSS",
    "url": "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=829",
    "weight": 1.3,
    "category": "Legal",
    "tags": ["court-ruling", "compliance", "corp-tax"],
    "pollIntervalMin": 60,
    "notes": "Globes Law section. Hebrew. Headlines-only."
  },
  {
    "name": "גלובס — נדל\"ן ותשתיות",
    "nameHe": "גלובס — נדל\"ן ותשתיות",
    "type": "RSS",
    "url": "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=607",
    "weight": 1.0,
    "category": "Business-News",
    "tags": ["real-estate-tax", "compliance"],
    "pollIntervalMin": 120,
    "notes": "Real estate and infrastructure. Mix of market news and regulatory."
  },
  {
    "name": "רשות המסים — פרסומים",
    "nameHe": "רשות המסים — פרסומים וחוזרים",
    "type": "SCRAPE",
    "url": "https://www.gov.il/he/collectors/publications?officeId=c0d8ba69-e309-4fe5-801f-855971774a90&limit=10&Type=0ec5a7ef-977c-459f-8c0a-dcfbe35c8164&drushimStatusType=1",
    "weight": 2.0,
    "category": "Tax",
    "tags": ["income-tax", "VAT", "corp-tax", "real-estate-tax", "compliance", "enforcement"],
    "pollIntervalMin": 720,
    "active": false,
    "notes": "HIGHEST VALUE. Gov.il React SPA — requires Playwright. Active=false until scraper is built (v1). Weight 2.0 reflects importance."
  },
  {
    "name": "המוסד לביטוח לאומי — חוזרים למעסיקים",
    "nameHe": "המוסד לביטוח לאומי — חוזרים למעסיקים",
    "type": "SCRAPE",
    "url": "https://www.btl.gov.il/Insurance/HozrimBituah/HozrimMasikim/Pages/default.aspx",
    "weight": 1.8,
    "category": "Payroll",
    "tags": ["payroll", "employment-law", "compliance"],
    "pollIntervalMin": 1440,
    "active": false,
    "notes": "ASP.NET — standard HTTP scraping works. Active=false until scraper built (v1)."
  },
  {
    "name": "Deloitte Israel — Tax Alerts",
    "nameHe": "דלויט ישראל — עדכוני מס",
    "type": "SCRAPE",
    "url": "https://www.deloitte.com/il/en/services/tax/perspectives/2025-tax-alerts-and-circulars.html",
    "weight": 1.5,
    "category": "Tax",
    "tags": ["income-tax", "VAT", "corp-tax", "real-estate-tax", "court-ruling", "enforcement"],
    "pollIntervalMin": 1440,
    "active": false,
    "notes": "35+ numbered alerts/year. JS-rendered. Professional interpretation layer. Active=false until scraper built."
  },
  {
    "name": "כלכליסט — כלכלה",
    "nameHe": "כלכליסט — כלכלה",
    "type": "RSS",
    "url": "http://www.calcalist.co.il/GeneralRSS/0,16335,L-3928,00.xml",
    "weight": 0.8,
    "category": "Business-News",
    "tags": ["grants", "compliance", "interest-rates"],
    "pollIntervalMin": 120,
    "notes": "General economy feed. Lower weight — higher noise. Useful for macro context."
  },
  {
    "name": "גלובס — שוק ההון",
    "nameHe": "גלובס — שוק ההון",
    "type": "RSS",
    "url": "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585",
    "weight": 0.7,
    "category": "Markets",
    "tags": ["corp-tax", "interest-rates", "compliance"],
    "pollIntervalMin": 120,
    "notes": "Capital markets. Low weight — only relevant when regulatory changes affect markets."
  }
]
```

**v0 active sources: 6 RSS feeds** (4 Calcalist + 2 Globes). The 4 SCRAPE sources are seeded with `active: false` — they exist in the registry as placeholders, ready when scraping infrastructure ships in v1.

---

## 5. AI Drafting Contract

### Model

- **Provider:** Anthropic (Claude Sonnet 4)
- **Model string:** `claude-sonnet-4-5-20250929`
- **SDK:** `@anthropic-ai/sdk`
- **Cost estimate:** ~$0.03/article × 20 articles/week = ~$2.50/week

### Prompt Architecture

Two prompts per draft generation:

**System prompt** (`prompts/article-draft-system.md`):
- Role: Israeli CPA firm content writer
- Voice: Bitan & Bitan house style — professional, authoritative, practical, Hebrew-native
- Output format: ContentBlock JSON array (matching existing `bodyBlocks` schema)
- Constraints: cite sources, flag unknowns with `[⚠ לא מאומת]`, no hallucinated numbers/dates/rates, use ₪ not NIS

**User prompt** (dynamic, built from Idea):
```
כתוב מאמר מקצועי בעברית בנושא:

כותרת: {idea.title}
תקציר מקור: {idea.description}
מקור: {idea.sourceUrl}
תאריך פרסום: {idea.sourcePublishedAt}
תגיות: {idea.tags.join(', ')}

הנחיות:
- כתוב 800–1,500 מילים
- פתח עם סיכום מנהלים (2-3 משפטים)
- פרט את ההשלכות המעשיות על עסקים קטנים ובינוניים
- סיים עם המלצות פעולה ("מה לעשות עכשיו")
- ציין את המקור המקורי
- סמן כל מידע שאינך בטוח לגביו ב-[⚠ לא מאומת]

פורמט הפלט: מערך JSON של ContentBlocks (ראה מבנה בהנחיות המערכת)
```

### Output Contract

Claude returns a JSON array of ContentBlocks. The drafting service:
1. Validates the JSON structure matches the ContentBlock type
2. Creates an Article with `bodyBlocks: blocks`, `editorialStatus: DRAFT`, `aiGenerated: true`
3. Links Article to Idea via `ideaId`
4. Creates an AIProposal record with input prompt, output blocks, token usage, and cost
5. Transitions Idea status from SELECTED → ENRICHED

### Error Handling

- **Invalid JSON from LLM:** Retry once with explicit format correction prompt. If still invalid, create Article with a single paragraph block containing raw text output + error note.
- **API timeout:** 60-second timeout. On failure, leave Idea in SELECTED state, log error in EventLog.
- **Rate limit:** Exponential backoff (1s, 2s, 4s). Max 3 retries.

---

## 6. Sanity Publishing Contract

### Integration Model

v0 uses **"push as draft, partner publishes"** flow:

```
Article APPROVED in OS Hub
        │
        ▼
"Publish to Website" button clicked
        │
        ▼
OS Hub creates Sanity document (draft)
        │
        ▼
PublishJob: SUCCEEDED, externalId = sanity._id
        │
        ▼
Partner opens Sanity Studio link → clicks Publish (goes live)
```

**Why draft, not direct publish:** Partners want a final visual check on the actual website before it goes live. The Sanity Studio publish button is a one-click safety net they already understand. In v1, we can add "publish immediately" as an option.

### Technical Requirements

- **SDK:** `@sanity/client` (already anticipated in env vars)
- **Auth:** Sanity API token with write permissions (stored as `SANITY_API_TOKEN`)
- **Config:** `SANITY_PROJECT_ID`, `SANITY_DATASET` from env

### Document Mapping (to be finalized after Sanity schema snapshot)

Preliminary mapping based on common Sanity blog schemas:

```typescript
function mapArticleToSanityDoc(article: Article): SanityDocument {
  return {
    _type: 'post',          // ← CONFIRM from website schema
    title: article.title,
    slug: { current: article.slug || slugify(article.title) },
    body: convertBlocksToPortableText(article.bodyBlocks),
    publishedAt: new Date().toISOString(),
    // SEO fields:
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.subtitle,
    // Metadata:
    tags: article.tags,
    category: article.category,
  };
}
```

**Critical unknown:** The `convertBlocksToPortableText()` function depends on the actual Sanity block content schema. Once you paste the Sanity schema snapshot, I'll write the exact mapper.

---

## 7. UI States

### Ideas Page (NEW — `content-factory/ideas/page.tsx`)

| State | What shows | Actions |
|-------|-----------|---------|
| **Empty** | "No ideas yet. Add sources to start scanning." + link to Sources page | — |
| **Loading** | Skeleton cards | — |
| **Ideas list** | Cards sorted by score (highest first). Each shows: title, source name, score badge, published date, tags. Score breakdown on hover/expand. | "Generate Draft" button (creates Article), "Reject" button, "View Source" link |
| **After draft generated** | Idea card shows "Draft created" badge with link to Article | "View Article" link |

### Sources Page (NEW — `content-factory/sources/page.tsx`)

| State | What shows | Actions |
|-------|-----------|---------|
| **Empty** | "No sources configured. Seed from defaults?" + "Seed Default Sources" button | Seed button |
| **Sources list** | Table: name, type badge (RSS/SCRAPE), active toggle, last polled, items found, weight | Add, edit, delete, toggle active, "Poll Now" button |
| **Poll running** | Spinner on the source row being polled | — |
| **Poll result** | Toast: "Found 12 new items, 3 duplicates skipped" | — |

### Article Detail (EXISTING — extend `content-factory/articles/[id]/page.tsx`)

New additions to existing page:

| State | What shows | Actions |
|-------|-----------|---------|
| **AI-generated draft** | "🤖 AI Draft" badge. Source Idea linked. "Tokens: 2,341 / Cost: $0.03" in metadata | All existing edit/approve actions |
| **Approved, not published** | Existing approval badge + NEW "Publish to Website" button (prominent, blue) | "Publish to Website" triggers Sanity push |
| **Publishing** | Button shows spinner + "Publishing to Sanity..." | — |
| **Published** | Green "Published to Website" badge + link to live page + Sanity Studio link | "View on Website" link, "Edit in Sanity" link |
| **Publish failed** | Red error badge with message. "Retry" button | Retry |

---

## 8. Observability

### EventLog Events (v0)

All new pipeline actions write EventLog entries:

| Action | Entity | Metadata |
|--------|--------|----------|
| `SOURCE_CREATED` | Source | `{ type, url, weight }` |
| `SOURCE_POLLED` | Source | `{ itemsFound, newIdeas, duplicatesSkipped, errors, durationMs }` |
| `IDEA_CREATED` | Idea | `{ sourceId, sourceName, fingerprint, score, scoreBreakdown }` |
| `IDEA_REJECTED` | Idea | `{ reason }` |
| `DRAFT_GENERATED` | Article | `{ ideaId, model, inputTokens, outputTokens, costUsd, durationMs }` |
| `DRAFT_GENERATION_FAILED` | Idea | `{ error, model, inputTokens }` |
| `SANITY_PUBLISH_STARTED` | PublishJob | `{ articleId, sanityDocType }` |
| `SANITY_PUBLISH_SUCCEEDED` | PublishJob | `{ sanityId, sanityUrl }` |
| `SANITY_PUBLISH_FAILED` | PublishJob | `{ error, statusCode }` |

### Cost Tracking

Every AI call stores in AIProposal.tokenUsage:

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "inputTokens": 1847,
  "outputTokens": 2341,
  "costUsd": 0.031,
  "durationMs": 8420
}
```

v0 surfaces this per-article in the detail page. Aggregate dashboard deferred to v1.

### Health Signals

- RSS poll success/failure rate (per source, last 24h)
- Ideas created per day
- Draft generation success/failure rate
- Average score of generated drafts
- Sanity publish success/failure rate

All queryable via EventLog. No separate metrics store needed for v0.

---

## 9. PR Task Plan (10 PRs)

Ordered by strict dependency. Each is independently deployable and testable.

---

### PR-01: Source Model + Migration + Idea Model Extensions

**Goal:** Add the Source table and extend Idea with scoring/dedup fields. Pure data layer — no API, no UI.

**Files to create/modify:**
- `prisma/schema.prisma` — add `Source` model, `SourceType` enum, extend `Idea` with `sourceId`, `fingerprint`, `score`, `scoreBreakdown`, `sourcePublishedAt`, add relation. Extend `Article` with `seoTitle`, `seoDescription`, `slug`, `sanityId`, `sanityUrl`, `aiGenerated`.
- `prisma/migrations/[timestamp]_content_factory_sources/migration.sql` — auto-generated

**Acceptance criteria:**
- [ ] `npx prisma migrate dev` succeeds
- [ ] `npx prisma generate` succeeds
- [ ] Source model has all fields from Section 2.2
- [ ] Idea model has new fields (sourceId FK, fingerprint, score, scoreBreakdown, sourcePublishedAt)
- [ ] Article model has new fields (seoTitle, seoDescription, slug unique, sanityId, sanityUrl, aiGenerated)
- [ ] All indexes created (Source.active, Source.type, Idea.fingerprint, Idea.score, Idea.sourceId, Article.slug, Article.sanityId)
- [ ] Existing 42 tests still pass

**Risk:** Migration on production DB with existing data. Ensure all new fields are nullable or have defaults.

---

### PR-02: Source Registry — CRUD API + Seed Script + Admin UI

**Goal:** Partners can view, add, edit, and manage content sources. Seed script populates the 10 default sources.

**Files to create:**
- `src/app/api/content-factory/sources/route.ts` — POST (create), GET (list with filters)
- `src/app/api/content-factory/sources/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/content-factory/sources/seed/route.ts` — POST (seed default sources from JSON)
- `src/lib/content-factory/sources/seed-data.ts` — the 10-source JSON from Section 4
- `src/app/content-factory/sources/page.tsx` — Sources admin page (table + add form)

**API contracts:**
```
POST /api/content-factory/sources         → { name, type, url, weight, tags, ... }
GET  /api/content-factory/sources         → Source[] (filter: ?active=true&type=RSS)
GET  /api/content-factory/sources/[id]    → Source (with lastPolledAt, lastError)
PATCH /api/content-factory/sources/[id]   → { active?, weight?, pollIntervalMin?, ... }
DELETE /api/content-factory/sources/[id]  → 204
POST /api/content-factory/sources/seed    → { created: number, skipped: number }
```

**Acceptance criteria:**
- [ ] Sources page accessible from Content Factory navigation
- [ ] Can add a new source (name, URL, type, weight, tags)
- [ ] Can toggle source active/inactive
- [ ] Can edit source weight and poll interval
- [ ] Seed endpoint creates 10 default sources (skips if URL already exists)
- [ ] EventLog written on create/update/delete
- [ ] Hebrew UI labels

---

### PR-03: Ideas CRUD API + Admin UI

**Goal:** Wire up the orphaned Idea model with API routes and an admin page showing scored ideas.

**Files to create:**
- `src/app/api/content-factory/ideas/route.ts` — POST (manual create), GET (list with sort/filter)
- `src/app/api/content-factory/ideas/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/content-factory/ideas/page.tsx` — Ideas list page (sorted by score, filterable by status)

**API contracts:**
```
POST /api/content-factory/ideas                → { title, description?, sourceType, sourceUrl?, tags? }
GET  /api/content-factory/ideas                → Idea[] (sort: ?sort=score:desc, filter: ?status=NEW)
GET  /api/content-factory/ideas/[id]           → Idea (with source info, linked article if exists)
PATCH /api/content-factory/ideas/[id]          → { status?, tags?, priority? }
DELETE /api/content-factory/ideas/[id]         → 204
```

**Acceptance criteria:**
- [ ] Ideas page shows cards sorted by score (highest first)
- [ ] Each card shows: title, source name + link, score badge, published date, tags
- [ ] Status filter: NEW, SELECTED, ENRICHED, REJECTED
- [ ] Can manually create an Idea (for partner-submitted ideas)
- [ ] Can reject an Idea (transitions to REJECTED)
- [ ] EventLog on all state changes
- [ ] Hebrew UI labels

---

### PR-04: RSS Ingestion Service + Manual Poll + De-dup + Scoring

**Goal:** Poll RSS sources, create scored/deduped Ideas. This is the core "upstream intelligence" PR.

**Files to create:**
- `src/lib/content-factory/ingestion/rss-parser.ts` — fetch + parse RSS XML (use `rss-parser` npm package)
- `src/lib/content-factory/ingestion/dedup.ts` — fingerprint generation (normalized lowercase title → SHA-256 hash) + URL exact match
- `src/lib/content-factory/ingestion/scoring.ts` — implement scoring rubric from Section 3 (keyword matching, recency, source weight, category bonus)
- `src/lib/content-factory/ingestion/keywords.ts` — keyword buckets from Section 3
- `src/app/api/content-factory/sources/[id]/poll/route.ts` — POST: manual poll trigger for one source
- `src/app/api/content-factory/sources/poll-all/route.ts` — POST: poll all active RSS sources
- `package.json` — add `rss-parser`

**API contracts:**
```
POST /api/content-factory/sources/[id]/poll  → { polled: 1, created: N, skipped: M, errors: [] }
POST /api/content-factory/sources/poll-all   → { polled: K, totalCreated: N, totalSkipped: M }
```

**Poll logic:**
1. Fetch RSS XML from source.url
2. For each entry: generate fingerprint from normalized title
3. Check fingerprint + sourceUrl against existing Ideas (skip duplicates)
4. Create Idea with: title, description (from RSS summary), sourceType=RSS, sourceId, sourceUrl, fingerprint, sourcePublishedAt, tags (inherited from source)
5. Run scoring: compute score + scoreBreakdown
6. Update Source: lastPolledAt, lastItemCount, lastError
7. Write EventLog: SOURCE_POLLED + IDEA_CREATED per new idea

**Dedup algorithm (v0):**
```typescript
function generateFingerprint(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')  // Remove Hebrew diacritics (nikud)
    .replace(/[^\w\s\u0590-\u05FF]/g, '') // Keep Hebrew + alphanumeric only
    .replace(/\s+/g, ' ');
  return sha256(normalized);
}

// Duplicate if: same fingerprint OR same sourceUrl
```

**Scoring implementation:**
```typescript
function scoreIdea(idea: Idea, source: Source, keywords: KeywordBuckets): ScoredIdea {
  const sourceWeight = (source.weight / 2.0) * 25;  // Normalize to 0–25
  
  const hoursAge = diffInHours(now(), idea.sourcePublishedAt);
  const recency = hoursAge < 6 ? 25 : hoursAge < 24 ? 20 : hoursAge < 48 ? 15 : hoursAge < 168 ? 10 : 5;
  
  const titleAndDesc = `${idea.title} ${idea.description || ''}`;
  const matchCount = countKeywordMatches(titleAndDesc, keywords);
  const keywordScore = matchCount >= 3 ? 30 : matchCount === 2 ? 20 : matchCount === 1 ? 10 : 0;
  
  const priorityCategories = ['Tax', 'Payroll', 'Regulation'];
  const standardCategories = ['Legal', 'Grants'];
  const categoryBonus = priorityCategories.includes(source.category) ? 20 
                       : standardCategories.includes(source.category) ? 12 
                       : 5;
  
  const score = sourceWeight + recency + keywordScore + categoryBonus;
  const breakdown = { sourceWeight, recency, keywordScore, categoryBonus, matchedKeywords: [...] };
  
  return { ...idea, score, scoreBreakdown: breakdown };
}
```

**Acceptance criteria:**
- [ ] Manual poll of a Calcalist RSS source creates Ideas
- [ ] Poll-all endpoint polls all active RSS sources
- [ ] Duplicate headlines (same URL or same fingerprint) are skipped
- [ ] Each Idea has a score (0–100) and scoreBreakdown JSON
- [ ] Score breakdown shows which keywords matched
- [ ] Source.lastPolledAt updated after poll
- [ ] EventLog entries for poll + each new Idea
- [ ] "Poll Now" button on Sources page triggers manual poll and shows result
- [ ] "Poll All Sources" button on Ideas page
- [ ] Unit tests for: fingerprint generation, scoring formula, dedup logic
- [ ] Integration test: mock RSS feed → creates scored Ideas

---

### PR-05: Claude Client + Prompt Templates

**Goal:** Production-ready Claude API client and article drafting prompts.

**Files to create:**
- `src/lib/ai/claude-client.ts` — Anthropic SDK wrapper with token counting, cost calculation, timeout, retry
- `src/lib/ai/prompt-loader.ts` — load markdown prompt files + interpolate variables
- `prompts/article-draft-system.md` — system prompt (Section 5 spec)
- `prompts/article-draft-user.md` — user prompt template with `{idea.title}`, `{idea.description}`, etc.
- `src/lib/ai/content-blocks.ts` — validate/parse ContentBlock JSON from LLM output
- `package.json` — add `@anthropic-ai/sdk`
- `src/config/integrations.ts` — add `ANTHROPIC_API_KEY` env var

**Claude client interface:**
```typescript
interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  durationMs: number;
}

class ClaudeClient {
  async complete(params: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;     // default 4096
    temperature?: number;    // default 0.3 for drafting
  }): Promise<ClaudeResponse>;
}
```

**Cost calculation:**
```typescript
// Claude Sonnet 4 pricing (as of 2026-03)
const PRICING = {
  'claude-sonnet-4-5-20250929': { inputPer1M: 3.0, outputPer1M: 15.0 }
};
```

**Acceptance criteria:**
- [ ] Claude client makes successful API call with ANTHROPIC_API_KEY from env
- [ ] Token usage and cost are calculated per call
- [ ] Timeout: 60 seconds, configurable
- [ ] Retry: up to 3 times with exponential backoff on rate limit (429)
- [ ] Prompt loader reads .md files and interpolates `{variable}` placeholders
- [ ] ContentBlock validator accepts valid arrays, rejects malformed ones
- [ ] System prompt is complete (not a stub) — role, voice, format, constraints
- [ ] User prompt template has all variables from Section 5
- [ ] Unit tests for: cost calculation, prompt interpolation, ContentBlock validation

---

### PR-06: AI Drafting — Idea → Article

**Goal:** "Generate Draft" button on Ideas page creates a Claude-drafted Hebrew article.

**Files to create:**
- `src/app/api/content-factory/ideas/[id]/draft/route.ts` — POST: generate article draft
- `src/lib/content-factory/drafting.ts` — orchestrator: load Idea → build prompt → call Claude → parse blocks → create Article
- Update `src/app/content-factory/ideas/page.tsx` — add "Generate Draft" button per NEW/SELECTED Idea

**Draft generation flow:**
```
1. Load Idea (validate status = NEW or SELECTED)
2. Load Source (for weight, category context)
3. Build prompts (system + user from templates)
4. Call Claude Sonnet 4 (temperature=0.3)
5. Parse response → ContentBlock[]
6. Validate blocks (must have ≥1 heading + ≥2 paragraphs)
7. Generate slug from title (Hebrew slugify)
8. Create Article:
   - title: idea.title (or Claude-suggested if different)
   - bodyBlocks: parsed blocks
   - ideaId: idea.id
   - editorialStatus: DRAFT
   - aiGenerated: true
   - slug: generated slug
   - tags: idea.tags
   - category: source.category
9. Create AIProposal:
   - entityType: ARTICLE
   - entityId: article.id
   - primitive: SUGGEST
   - input: { systemPrompt, userPrompt, model, temperature }
   - output: { blocks, rawText }
   - outcome: PENDING (until partner approves/rejects the article)
   - tokenUsage: { model, inputTokens, outputTokens, costUsd, durationMs }
10. Transition Idea: status → ENRICHED
11. Write EventLog: DRAFT_GENERATED
```

**API contract:**
```
POST /api/content-factory/ideas/[id]/draft
  → 201: { articleId, title, tokensUsed, costUsd }
  → 400: { error: "Idea must be in NEW or SELECTED status" }
  → 500: { error: "Draft generation failed", details }
```

**Acceptance criteria:**
- [ ] "Generate Draft" button visible on Ideas page for NEW/SELECTED ideas
- [ ] Clicking generates a Hebrew article draft via Claude
- [ ] Article created with DRAFT status, linked to Idea
- [ ] Body is valid ContentBlock JSON (≥1 heading, ≥2 paragraphs)
- [ ] AIProposal record created with full input/output/cost
- [ ] Idea transitions to ENRICHED
- [ ] EventLog records draft generation
- [ ] Token count and cost displayed on Article detail page
- [ ] Error handling: invalid JSON from LLM creates article with raw text fallback
- [ ] Loading state on button while generating (~10-15 seconds)

---

### PR-07: Sanity Client + Schema Mapping

**Goal:** Sanity write client and article-to-Sanity document mapper.

**⚠️ BLOCKED: Requires Sanity schema snapshot from website repo.** Implement with best-guess schema, finalize mapping after schema is confirmed.

**Files to create:**
- `src/lib/sanity/client.ts` — Sanity client singleton (createClient from @sanity/client)
- `src/lib/sanity/mapper.ts` — Article → Sanity document mapper
- `src/lib/sanity/portable-text.ts` — ContentBlock[] → Portable Text converter
- `src/config/integrations.ts` — add SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN
- `package.json` — add `@sanity/client`

**Portable Text conversion (ContentBlock → Sanity blocks):**
```typescript
function convertBlocksToPortableText(blocks: ContentBlock[]): PortableTextBlock[] {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'heading':
        return {
          _type: 'block',
          _key: `block-${index}`,
          style: `h${block.level}`,
          children: [{ _type: 'span', text: block.text }]
        };
      case 'paragraph':
        return {
          _type: 'block',
          _key: `block-${index}`,
          style: 'normal',
          children: parseInlineMarks(block.text)
        };
      case 'list':
        return block.items.map((item, i) => ({
          _type: 'block',
          _key: `block-${index}-${i}`,
          style: 'normal',
          listItem: block.style === 'bullet' ? 'bullet' : 'number',
          level: 1,
          children: [{ _type: 'span', text: item }]
        }));
      // ... handle other block types
    }
  }).flat();
}
```

**Acceptance criteria:**
- [ ] Sanity client connects with credentials from env
- [ ] Can create a draft document in Sanity
- [ ] ContentBlock → Portable Text conversion handles: heading, paragraph, list, callout, divider, quote
- [ ] Hebrew text preserved correctly through conversion
- [ ] Inline marks (**bold**, *italic*, [links]) converted to Portable Text decorators
- [ ] Unit tests for block conversion
- [ ] Integration test: create + read back document from Sanity (can use sandbox dataset)

---

### PR-08: Publish to Sanity — End-to-End Flow

**Goal:** "Publish to Website" button on approved articles pushes to Sanity and completes the v0 loop.

**Files to modify:**
- `src/app/content-factory/articles/[id]/page.tsx` — add "Publish to Website" button (visible only when editorialStatus=APPROVED and sanityId is null)
- `src/app/api/content-factory/articles/[id]/publish-website/route.ts` — POST: orchestrate Sanity publish

**Publish flow:**
```
1. Validate article is APPROVED
2. Create WEBSITE Asset (if none exists) with auto-APPROVED status
3. Call Sanity client to create document (as draft)
4. Create PublishJob with method=WEBSITE_DIRECT, status=SUCCEEDED
5. Store sanityId + sanityUrl on Article
6. Update distribution status
7. Write EventLog: SANITY_PUBLISH_SUCCEEDED
8. Return: { sanityId, sanityUrl, studioUrl }
```

**API contract:**
```
POST /api/content-factory/articles/[id]/publish-website
  → 201: { publishJobId, sanityId, sanityUrl, studioUrl }
  → 400: { error: "Article must be APPROVED to publish" }
  → 409: { error: "Article already published to Sanity", sanityId }
  → 500: { error: "Sanity publish failed", details }
```

**Acceptance criteria:**
- [ ] "Publish to Website" button appears on APPROVED articles
- [ ] Clicking creates a Sanity document (as draft)
- [ ] PublishJob created with SUCCEEDED status
- [ ] Article.sanityId and Article.sanityUrl populated
- [ ] Distribution status updates to PARTIALLY_PUBLISHED or FULLY_PUBLISHED
- [ ] EventLog captures Sanity document ID
- [ ] Button becomes "Published ✓" + links to live page and Sanity Studio
- [ ] Error state: shows error message + retry button
- [ ] Cannot publish same article twice (409 if sanityId exists)

---

### PR-09: Cron — Automated RSS Polling

**Goal:** RSS sources polled automatically on a schedule. Uses Railway cron.

**Files to create:**
- `src/app/api/cron/ingest/route.ts` — GET endpoint (protected by secret header) that polls all active RSS sources
- `src/lib/content-factory/ingestion/cron-config.ts` — cron secret validation, logging
- Railway cron job configuration (documented in README)

**Cron design (Railway-native):**
```
Railway cron job: every 60 minutes
→ GET https://os-hub.up.railway.app/api/cron/ingest
→ Header: Authorization: Bearer {CRON_SECRET}
→ Response: { polled: 6, totalCreated: 4, totalSkipped: 18, errors: [] }
```

**Acceptance criteria:**
- [ ] Cron endpoint polls all active RSS sources
- [ ] Protected by CRON_SECRET env var (rejects requests without valid secret)
- [ ] Returns summary of poll results
- [ ] EventLog entry per poll run (aggregate)
- [ ] Works with Railway cron configuration
- [ ] Documented in README: how to set up cron on Railway
- [ ] Graceful handling: if one source fails, continues polling others

---

### PR-10: Navigation + Polish + Smoke Tests

**Goal:** Wire everything together in the Founder Console navigation. Polish UI. End-to-end smoke test.

**Files to modify:**
- Side navigation: add "Sources" and "Ideas" under Content Factory section
- Content Factory landing page: show pipeline summary (sources count, ideas today, articles in review, published)
- Ideas page: add "View Article" link for ideas with linked articles
- Articles page: show AI-generated badge, source idea link, Sanity publish status

**Smoke test script** (`scripts/smoke-test-v0.ts`):
```
1. Seed sources (POST /api/content-factory/sources/seed)
2. Poll all sources (POST /api/content-factory/sources/poll-all)
3. Verify Ideas created (GET /api/content-factory/ideas?sort=score:desc)
4. Generate draft from top Idea (POST /api/content-factory/ideas/[id]/draft)
5. Verify Article created with bodyBlocks
6. Transition Article: DRAFT → IN_REVIEW → APPROVED
7. Publish to Sanity (POST /api/content-factory/articles/[id]/publish-website)
8. Verify PublishJob SUCCEEDED and sanityId populated
```

**Acceptance criteria:**
- [ ] Sources and Ideas accessible from side nav
- [ ] Content Factory landing shows pipeline summary
- [ ] Full end-to-end flow works: Seed → Poll → Score → Draft → Approve → Publish
- [ ] Hebrew UI throughout
- [ ] No 500 errors in happy path
- [ ] Smoke test script runs successfully against local environment

---

## 10. Operational Defaults

| Parameter | v0 Value | Rationale |
|-----------|----------|-----------|
| RSS poll frequency | 60 min (cron) | Balance freshness vs. load. Most tax news is not minute-sensitive. |
| Active sources at launch | 6 RSS feeds | 4 Calcalist + 2 Globes. Scrape sources seeded but inactive. |
| Ideas retention | Keep all (no auto-archive) | Low volume. Partners decide what to reject. |
| Draft generation model | Claude Sonnet 4 | Cost-effective + good Hebrew quality. |
| Draft temperature | 0.3 | Low creativity. Professional content should be consistent. |
| Draft max tokens | 4096 | ~1,500 Hebrew words. Enough for a full article. |
| Sanity publish mode | Create as draft | Partners do final publish in Sanity Studio. |
| Cost tracking | Per-article in AIProposal | No aggregate dashboard in v0. |
| LLM monthly budget | ~$20 soft limit | At ~$0.03/article, supports 600+ articles/month. Unlikely to hit. |

---

## 11. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Calcalist/Globes RSS feeds change URLs** | Ingestion breaks for that source | Source.lastError populated on failure. Alert via poll summary. Low probability — these feeds have been stable for years. |
| **Claude generates factually incorrect Hebrew content** | Wrong tax advice → reputational risk | System prompt mandates `[⚠ לא מאומת]` flags. Partners review every draft. EventLog tracks AI origin. |
| **Sanity schema mismatch** | Publish fails or creates broken pages | PR-07 includes schema validation. Mapper is unit-tested. First publish is to draft (not live). |
| **Railway cron unreliable** | Gaps in RSS polling | Manual "Poll All" button as fallback. EventLog tracks last successful poll. |
| **Hebrew slugify edge cases** | Duplicate or broken URLs | Slug uniqueness enforced at DB level. Fallback: append random suffix. |
| **ContentBlock JSON parsing from LLM** | Malformed article body | Retry with format-correction prompt. Fallback: raw text in single paragraph block. |

---

## 12. Success Criteria (v0 Complete When)

1. ✅ 6 RSS sources actively polling on hourly cron
2. ✅ Ideas created automatically with scores and Hebrew keyword matches
3. ✅ "Generate Draft" produces a readable Hebrew article from any Idea
4. ✅ Article approval flow works (existing, unchanged)
5. ✅ "Publish to Website" creates a Sanity document with correct Portable Text
6. ✅ Partners can open Sanity Studio and publish the post live
7. ✅ Full audit trail: EventLog + AIProposal for every automated action
8. ✅ End-to-end loop completes in under 5 minutes (poll to published draft)
9. ✅ Zero partner training required beyond: "go to Ideas, click Generate, review, approve, publish"

---

## Appendix A: File Tree (New/Modified Files)

```
apps/os-hub/
├── prisma/
│   └── schema.prisma                          # MODIFIED: +Source model, +Idea/Article fields
├── src/
│   ├── app/
│   │   ├── api/content-factory/
│   │   │   ├── sources/
│   │   │   │   ├── route.ts                   # NEW: POST/GET sources
│   │   │   │   ├── [id]/route.ts              # NEW: GET/PATCH/DELETE source
│   │   │   │   ├── [id]/poll/route.ts         # NEW: POST poll single source
│   │   │   │   ├── poll-all/route.ts          # NEW: POST poll all active sources
│   │   │   │   └── seed/route.ts              # NEW: POST seed default sources
│   │   │   ├── ideas/
│   │   │   │   ├── route.ts                   # NEW: POST/GET ideas
│   │   │   │   ├── [id]/route.ts              # NEW: GET/PATCH/DELETE idea
│   │   │   │   └── [id]/draft/route.ts        # NEW: POST generate draft
│   │   │   └── articles/
│   │   │       └── [id]/publish-website/route.ts  # NEW: POST publish to Sanity
│   │   ├── api/cron/
│   │   │   └── ingest/route.ts                # NEW: cron-triggered poll endpoint
│   │   └── content-factory/
│   │       ├── sources/page.tsx               # NEW: Sources admin page
│   │       └── ideas/page.tsx                 # NEW: Ideas list page
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── claude-client.ts               # NEW: Anthropic SDK wrapper
│   │   │   ├── prompt-loader.ts               # NEW: prompt template loader
│   │   │   └── content-blocks.ts              # NEW: ContentBlock validator
│   │   ├── content-factory/
│   │   │   ├── ingestion/
│   │   │   │   ├── rss-parser.ts              # NEW: RSS fetch + parse
│   │   │   │   ├── dedup.ts                   # NEW: fingerprint + dedup
│   │   │   │   ├── scoring.ts                 # NEW: scoring rubric
│   │   │   │   ├── keywords.ts                # NEW: keyword buckets
│   │   │   │   └── cron-config.ts             # NEW: cron auth
│   │   │   ├── drafting.ts                    # NEW: Idea → Article orchestrator
│   │   │   └── sources/
│   │   │       └── seed-data.ts               # NEW: 10-source seed JSON
│   │   └── sanity/
│   │       ├── client.ts                      # NEW: Sanity client singleton
│   │       ├── mapper.ts                      # NEW: Article → Sanity doc mapper
│   │       └── portable-text.ts               # NEW: ContentBlock → Portable Text
│   └── config/
│       └── integrations.ts                    # MODIFIED: +Sanity +Anthropic env vars
├── prompts/
│   ├── article-draft-system.md                # NEW: system prompt (real content)
│   └── article-draft-user.md                  # NEW: user prompt template
├── scripts/
│   └── smoke-test-v0.ts                       # NEW: end-to-end test script
└── tests/
    ├── dedup.test.ts                          # NEW: fingerprint + dedup tests
    ├── scoring.test.ts                        # NEW: scoring formula tests
    └── content-blocks.test.ts                 # NEW: ContentBlock validation tests
```

---

## Appendix B: Environment Variables (New for v0)

| Variable | Required | Default | Used By |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Yes (PR-05+) | — | Claude client |
| `SANITY_PROJECT_ID` | Yes (PR-07+) | — | Sanity client |
| `SANITY_DATASET` | Yes (PR-07+) | `production` | Sanity client |
| `SANITY_API_TOKEN` | Yes (PR-07+) | — | Sanity client (write token) |
| `CRON_SECRET` | Yes (PR-09) | — | Cron endpoint auth |

---

*End of master plan. Ship it.*
