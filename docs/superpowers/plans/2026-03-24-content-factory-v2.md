# Content Factory V2 — Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Bitan OS Content Factory from an automated idea-scraping pipeline into a reference-upload → AI-draft → edit → publish-to-Sanity → newsletter workflow that matches how Avi & Ron actually create content.

**Architecture:** Upload reference files (PDF/DOCX/links) → Claude AI generates a brand-aware Hebrew article draft → Ron/Avi edit in the OS block editor → one-click push to Sanity (all fields populated) → AI image generation → final Sanity review → publish → optional Summit newsletter push. The existing idea-sourcing pipeline (sources/ideas) moves to a secondary tab.

**Tech Stack:** Next.js 14.2, Prisma/PostgreSQL, Claude Sonnet 4.6 (streaming), Sanity v3 API, Gemini Imagen 4 (image gen), Summit CRM API (newsletter), CSS Modules (design system tokens)

---

## Current State Summary

**What exists and is reusable:**
- `claude-client.ts` — `complete()` + `streamComplete()` with retry/streaming ✅
- `content-blocks.ts` — `ContentBlock` type + validation + parse ✅
- `drafting.ts` — Draft orchestrator (needs new prompt path, but structure reusable) ✅
- `sanity-publisher.ts` — Push to Sanity + asset/job tracking ✅
- `sanity/mapper.ts` — Article → Sanity doc mapping ✅
- `sanity/portable-text.ts` — ContentBlocks → Portable Text converter ✅
- Article editor (`articles/[id]/page.tsx`) — Block editor with merge/split, status transitions ✅
- Prompt templates (`prompts/article-draft-system.md`, `article-draft-user.md`) — Need enhancement for reference context ✅
- `integrations.ts` + `settings.ts` — DB-backed configurable URLs ✅

**What gets removed:**
- Content Engine (`/content-engine` page, `ContentEngineClient.tsx`, `/api/content-engine/*`) — DOCX→PDF converter, unused
- Content Engine nav item from sidebar

**What gets restructured:**
- Content Factory hub becomes the article-centric main view
- Sources/Ideas move to a sub-tab ("מקורות רעיונות")
- New "מאמר חדש" flow replaces the old idea→draft path

---

## File Structure

### New files to create

```
src/app/content-factory/new/
├── page.tsx                    — Upload & draft generation page (the main new flow)
└── page.module.css             — Styles for upload page

src/app/api/content-factory/
├── upload-refs/route.ts        — POST: accept file uploads (PDF/DOCX), store temporarily
├── generate-draft/route.ts     — POST: send refs + context to Claude, stream back draft
├── articles/[id]/
│   ├── push-to-sanity/route.ts — POST: enhanced Sanity push (all fields, image, SEO)
│   └── generate-image/route.ts — POST: Gemini Imagen 4 image gen + Sanity upload
└── newsletter/route.ts         — POST: prepare & send newsletter via Summit API

src/lib/content-factory/
├── ref-extractor.ts            — Extract text from PDF/DOCX uploads for Claude context
├── draft-from-refs.ts          — New drafting orchestrator (refs → Claude → Article)
└── newsletter-sender.ts        — Summit newsletter integration

prompts/
├── article-from-refs-system.md — System prompt (enhanced: brand voice + reference awareness)
└── article-from-refs-user.md   — User prompt template (refs content + instructions)
```

### Files to modify

```
src/components/SideNav.tsx              — Remove Content Engine, restructure Content Factory children
src/app/content-factory/page.tsx        — Redesign as article list + "מאמר חדש" CTA
src/app/content-factory/page.module.css — Updated hub styles
src/app/content-factory/articles/[id]/page.tsx — Add "push to Sanity" + "generate image" buttons
src/lib/sanity/mapper.ts                — Enhance: authors[], categories[], mainImage, excerpt, checklist
src/lib/content-factory/publishers/sanity-publisher.ts — Enhance: populate ALL Sanity fields
src/lib/strings/he.ts                   — New Hebrew strings for V2 UI
prisma/schema.prisma                    — Add RefUpload model (with Article relation) for tracking uploaded files
src/app/page.tsx                        — Dashboard: remove Content Engine card, update stats
```

### Files to archive/remove

```
src/app/content-engine/page.tsx                    — DELETE (archived via git)
src/components/ContentEngineClient.tsx              — DELETE
src/app/api/content-engine/upload/route.ts          — DELETE
src/app/api/content-engine/history/route.ts         — DELETE
src/app/api/content-engine/history/[id]/download/route.ts — DELETE
```

---

## Chunk 1: Cleanup & Nav Restructure

### Task 1: Remove Content Engine from UI

**Files:**
- Modify: `src/components/SideNav.tsx`
- Modify: `src/app/page.tsx` (dashboard)
- Modify: `src/lib/strings/he.ts`
- Delete: `src/app/content-engine/page.tsx`
- Delete: `src/app/content-engine/page.module.css` (if exists)
- Delete: `src/components/ContentEngineClient.tsx`

- [ ] **Step 1: Remove Content Engine from SideNav**

In `SideNav.tsx`, remove `{ key: "nav.items.contentEngine", href: "/content-engine" }` from `mainNav`. Add children to Content Factory:

```typescript
const mainNav: NavItem[] = [
  { key: "nav.items.dashboard", href: "/" },
  {
    key: "nav.items.contentFactory",
    href: "/content-factory",
    children: [
      { key: "nav.items.contentFactory.new", href: "/content-factory/new" },
      { key: "nav.items.contentFactory.articles", href: "/content-factory/articles" },
      { key: "nav.items.contentFactory.ideaMonitor", href: "/content-factory/ideas" },
      { key: "nav.items.contentFactory.sources", href: "/content-factory/sources" },
    ],
  },
  { key: "nav.items.sumitSync", href: "/sumit-sync" },
  { key: "nav.items.bitanWebsite", href: "/bitan-website" },
];
```

- [ ] **Step 2: Add new Hebrew strings**

In `src/lib/strings/he.ts`, add:

```typescript
"nav.items.contentFactory.new": "מאמר חדש",
"nav.items.contentFactory.ideaMonitor": "מקורות רעיונות",

// Content Factory V2
"contentFactory.hub.title": "Content Factory",
"contentFactory.hub.subtitle": "ניהול מאמרים ותוכן מקצועי",
"contentFactory.new.title": "מאמר חדש",
"contentFactory.new.subtitle": "העלאת חומרי מקור ויצירת טיוטה",
"contentFactory.new.uploadTitle": "חומרי מקור",
"contentFactory.new.uploadDesc": "גרור קבצים לכאן או לחץ לבחירה — PDF, DOCX או קישור לדף",
"contentFactory.new.addLink": "הוסף קישור",
"contentFactory.new.generateDraft": "צור טיוטה",
"contentFactory.new.generating": "יוצר טיוטה...",
"contentFactory.new.topicLabel": "נושא המאמר (אופציונלי)",
"contentFactory.new.topicPlaceholder": "למשל: מענקים לעסקים קטנים 2026",
"contentFactory.new.notesLabel": "הנחיות נוספות (אופציונלי)",
"contentFactory.new.notesPlaceholder": "הנחיות ספציפיות — קהל יעד, זווית, דגשים...",
"contentFactory.articles.pushToSanity": "העבר לאתר",
"contentFactory.articles.generateImage": "צור תמונה",
"contentFactory.articles.generatingImage": "יוצר תמונה...",
"contentFactory.articles.pushingToSanity": "מעביר לאתר...",
"contentFactory.articles.pushedToSanity": "הועבר לאתר בהצלחה",
"contentFactory.articles.sendNewsletter": "שלח ניוזלטר",
```

- [ ] **Step 3: Remove Content Engine from dashboard**

In `src/app/page.tsx`, remove the Content Engine module card from the modules array. Keep all other cards.

- [ ] **Step 4: Delete Content Engine files**

Delete these files (they'll remain in git history):
- `src/app/content-engine/page.tsx`
- `src/app/content-engine/page.module.css` (if exists)
- `src/components/ContentEngineClient.tsx`
- `src/components/ContentEngineClient.module.css` (if exists)

Note: Keep the API routes (`/api/content-engine/*`) for now — they can be cleaned up in a later pass since they don't affect the UI.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Content Engine from UI, restructure Content Factory nav"
```

---

## Chunk 2: Reference Upload & AI Draft Generation

### Task 2: Prisma model for reference uploads

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration SQL

- [ ] **Step 1: Add RefUpload model to schema**

```prisma
model RefUpload {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  filename    String
  mimeType    String
  sizeBytes   Int
  textContent String?  @db.Text   // extracted text for Claude context
  url         String?             // if source is a URL, not a file
  articleId   String?  @db.Uuid   // linked after draft generation
  article     Article? @relation(fields: [articleId], references: [id])
  createdAt   DateTime @default(now())

  @@index([articleId])
  @@map("ref_uploads")
}
```

- [ ] **Step 2: Generate Prisma client + create migration**

```bash
npx prisma generate
mkdir -p prisma/migrations/20260324100000_add_ref_uploads
```

Write migration SQL:
```sql
CREATE TABLE "ref_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "textContent" TEXT,
    "url" TEXT,
    "articleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ref_uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ref_uploads_articleId_idx" ON "ref_uploads"("articleId");
ALTER TABLE "ref_uploads" ADD CONSTRAINT "ref_uploads_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL;
```

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add RefUpload model for reference file tracking"
```

### Task 3: Reference text extraction

**Files:**
- Create: `src/lib/content-factory/ref-extractor.ts`

- [ ] **Step 1: Install pdf-parse**

```bash
npm install pdf-parse
```

Note: DOCX text extraction can use mammoth (already a common lib). Check if mammoth is installed; if not, install it.

```bash
npm install mammoth
```

**IMPORTANT:** Add both `pdf-parse` and `mammoth` to `experimental.serverComponentsExternalPackages` in `next.config.js` — `pdf-parse` uses Node.js `fs` to load a test PDF on import, which breaks webpack bundling without this.

- [ ] **Step 2: Create ref-extractor.ts**

```typescript
// src/lib/content-factory/ref-extractor.ts
import pdf from "pdf-parse";
import mammoth from "mammoth";

export interface ExtractedRef {
  filename: string;
  text: string;
  charCount: number;
}

/**
 * Extract readable text from a PDF buffer.
 */
export async function extractPdfText(buffer: Buffer, filename: string): Promise<ExtractedRef> {
  const data = await pdf(buffer);
  const text = data.text.trim();
  return { filename, text, charCount: text.length };
}

/**
 * Extract readable text from a DOCX buffer.
 */
export async function extractDocxText(buffer: Buffer, filename: string): Promise<ExtractedRef> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  return { filename, text, charCount: text.length };
}

/**
 * Route extraction based on MIME type.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ExtractedRef> {
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    return extractPdfText(buffer, filename);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    return extractDocxText(buffer, filename);
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Truncate extracted text to fit within Claude context budget.
 * Reserve ~80K chars for reference content (roughly 20K tokens).
 */
export function truncateForContext(refs: ExtractedRef[], maxChars = 80000): string {
  const combined = refs.map((r) => `=== ${r.filename} ===\n${r.text}`).join("\n\n---\n\n");
  if (combined.length <= maxChars) return combined;
  return combined.slice(0, maxChars) + "\n\n[... תוכן נוסף קוצר עקב אורך]";
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/content-factory/ref-extractor.ts package.json package-lock.json
git commit -m "feat: add PDF/DOCX text extraction for reference uploads"
```

### Task 4: Upload API route

**Files:**
- Create: `src/app/api/content-factory/upload-refs/route.ts`

- [ ] **Step 1: Create upload-refs route**

Accepts multipart form data with one or more files. Extracts text, stores in RefUpload table, returns extracted text summaries.

```typescript
// src/app/api/content-factory/upload-refs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma, withRetry } from "@/lib/prisma";
import { extractText } from "@/lib/content-factory/ref-extractor";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const results = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds 20MB limit` },
          { status: 400 },
        );
      }

      // Validate file type before extraction
      const isAllowed =
        ALLOWED_TYPES.includes(file.type) || /\.(pdf|docx)$/i.test(file.name);
      if (!isAllowed) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name} (${file.type})` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractText(buffer, file.name, file.type);

      const record = await withRetry(() =>
        prisma.refUpload.create({
          data: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            textContent: extracted.text,
          },
        }),
      );

      results.push({
        id: record.id,
        filename: file.name,
        charCount: extracted.charCount,
        preview: extracted.text.slice(0, 200) + (extracted.text.length > 200 ? "..." : ""),
      });
    }

    return NextResponse.json({ uploads: results });
  } catch (err) {
    console.error("[upload-refs] Error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/content-factory/upload-refs/route.ts"
git commit -m "feat: add reference file upload API with text extraction"
```

### Task 5: Enhanced AI draft generation from references

**Files:**
- Create: `prompts/article-from-refs-system.md`
- Create: `prompts/article-from-refs-user.md`
- Create: `src/lib/content-factory/draft-from-refs.ts`
- Create: `src/app/api/content-factory/generate-draft/route.ts`

- [ ] **Step 1: Create enhanced system prompt**

File: `prompts/article-from-refs-system.md`

This extends the existing system prompt with reference-awareness. Same brand voice, but now the AI knows it's working from source documents, not just a topic.

```markdown
אתה כותב תוכן מקצועי עבור משרד רואי חשבון ביטן את ביטן — משרד ישראלי מוביל המתמחה במיסוי, שכר, וייעוץ עסקי.

## תפקידך

כתוב מאמר מקצועי בעברית עבור הבלוג של המשרד, בהתבסס על חומרי מקור שהועלו. המאמר מיועד לבעלי עסקים, מנהלי כספים, ויועצי מס בישראל.

## חומרי מקור

קיבלת חומרי מקור (מסמכים, מצגות, חוזרים מקצועיים). עליך:
1. **לעבד את החומר** — הפוך מסמך מקצועי/חוקי לשפה נגישה לבעלי עסקים.
2. **לא להמציא** — השתמש רק במידע שמופיע בחומרי המקור. אם חסר מידע, סמן [⚠ לא מאומת].
3. **להוסיף ערך** — הסבר השלכות מעשיות, מי מושפע, מה צריך לעשות.
4. **לציין מקורות** — אם החומר מבוסס על חוזר, פסיקה, או פרסום רשמי — ציין אותו.

## סגנון כתיבה — בית הסגנון של ביטן את ביטן

1. **מקצועי אך נגיש** — השתמש במונחים מקצועיים נכונים, אבל הסבר אותם בשפה ברורה.
2. **עברית תקנית** — עברית עשירה ונכונה דקדוקית. אין סלנג, אין אנגלית מיותרת.
3. **מעשי** — כל מאמר צריך לכלול לפחות 2-3 צעדים מעשיים שהקורא יכול ליישם.
4. **מדויק** — ציין מספרי סעיפים, תאריכים, וסכומים רק אם הם מופיעים בחומרי המקור.
5. **אובייקטיבי** — הצג מידע עובדתי. אל תמכור שירותים של המשרד.
6. **מובנה** — כותרות, פסקאות קצרות, רשימות. קל לסריקה.

## פורמט פלט

החזר אובייקט JSON יחיד בפורמט הבא (ללא טקסט נוסף לפני או אחרי):

{same JSON format as existing article-draft-system.md — meta + blocks}

## סוגי בלוקים (blocks)

- `heading` — כותרת (level: 1, 2, או 3). חייב להיות לפחות כותרת אחת.
- `paragraph` — פסקה. חייב להיות לפחות 2 פסקאות. תומך ב: `**bold**`, `*italic*`, `[text](url)`.
- `list` — רשימה (style: "bullet" או "number", items: מערך מחרוזות).
- `quote` — ציטוט (text + attribution אופציונלי).
- `callout` — הערה מודגשת (title אופציונלי + text).
- `divider` — קו הפרדה.

## כללי ברזל

1. **עברית בלבד** — כל התוכן בעברית. מונחים באנגלית רק כשאין תרגום מקובל.
2. **לא להמציא מספרים** — סכומים, שיעורי מס, תאריכים — רק מחומרי המקור.
3. **לציין מקורות** — חוזר מקצועי, פסק דין, פרסום ברשומות — ציין מספר ותאריך.
4. **אורך** — 800-1,500 מילים. לא פחות מ-800.
5. **JSON תקני** — החזר JSON בלבד, ללא טקסט נוסף.
```

- [ ] **Step 2: Create user prompt template**

File: `prompts/article-from-refs-user.md`

```markdown
כתוב מאמר מקצועי בהתבסס על חומרי המקור הבאים:

## חומרי מקור

{refContent}

## הנחיות נוספות

**נושא:** {topic}

**הנחיות מהמשתמש:** {userNotes}

## דרישות

1. בסס את המאמר על חומרי המקור שלמעלה.
2. הוסף ערך מקצועי — הסבר את ההשלכות על בעלי עסקים ומנהלי כספים.
3. כלול לפחות 2-3 צעדים מעשיים שהקורא יכול ליישם.
4. אם מידע חסר בחומרי המקור — סמן [⚠ לא מאומת].
5. כתוב בטון מקצועי אך נגיש.
6. ודא שה-JSON תקני ומלא.
```

- [ ] **Step 3: Create draft-from-refs.ts orchestrator**

```typescript
// src/lib/content-factory/draft-from-refs.ts
import { prisma } from "@/lib/prisma";
import { streamComplete } from "@/lib/ai/claude-client";
import { loadPrompt } from "@/lib/ai/prompt-loader";
import { parseDraftResponse, validateContentBlocks } from "@/lib/ai/content-blocks";
import { truncateForContext } from "@/lib/content-factory/ref-extractor";
import type { ExtractedRef } from "@/lib/content-factory/ref-extractor";
import type { DraftResponse } from "@/lib/ai/content-blocks";
import crypto from "crypto";

export interface DraftFromRefsInput {
  refUploadIds: string[];
  topic?: string;
  userNotes?: string;
}

export interface DraftFromRefsResult {
  articleId: string;
  title: string;
  blockCount: number;
  durationMs: number;
}

export async function generateDraftFromRefs(
  input: DraftFromRefsInput,
): Promise<DraftFromRefsResult> {
  const t0 = Date.now();

  // 1. Load reference texts from DB
  const uploads = await prisma.refUpload.findMany({
    where: { id: { in: input.refUploadIds } },
  });

  if (!uploads.length) {
    throw new Error("No reference uploads found");
  }

  const refs: ExtractedRef[] = uploads
    .filter((u) => u.textContent)
    .map((u) => ({
      filename: u.filename,
      text: u.textContent!,
      charCount: u.textContent!.length,
    }));

  if (!refs.length) {
    throw new Error("No text could be extracted from uploaded files");
  }

  // 2. Build prompts
  const refContent = truncateForContext(refs);
  const systemPrompt = loadPrompt("article-from-refs-system.md");
  const userPrompt = loadPrompt("article-from-refs-user.md", {
    refContent,
    topic: input.topic || "(לא צוין — הסק מחומרי המקור)",
    userNotes: input.userNotes || "אין הנחיות נוספות.",
  });

  // 3. Call Claude (streaming)
  console.log("[draft-from-refs] Generating draft, ref chars:", refContent.length);
  const response = await streamComplete({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // 4. Parse response
  const parsed: DraftResponse | null = parseDraftResponse(response.text);
  if (!parsed) {
    throw new Error("Failed to parse Claude response into article blocks");
  }

  const validation = validateContentBlocks(parsed.blocks);
  if (!validation.valid) {
    console.warn("[draft-from-refs] Block validation warnings:", validation.errors);
  }

  // 5. Build article text for search/preview
  const bodyText = parsed.blocks
    .filter((b) => b.type === "paragraph" || b.type === "heading")
    .map((b) => b.text)
    .join("\n\n");

  // 6. Generate slug
  const titleSlug = (parsed.blocks.find((b) => b.type === "heading")?.text || "article")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const slug = `${titleSlug}-${crypto.randomBytes(3).toString("hex")}`;

  const title =
    parsed.blocks.find((b) => b.type === "heading" && b.level === 1)?.text ||
    parsed.meta.seoTitle ||
    input.topic ||
    "מאמר חדש";

  // 7. Create Article
  const article = await prisma.article.create({
    data: {
      title,
      subtitle: parsed.meta.tldr || parsed.meta.excerpt || null,
      bodyBlocks: parsed.blocks as unknown as any, // eslint-disable-line
      bodyText,
      status: "DRAFT",
      seoTitle: parsed.meta.seoTitle || null,
      seoDescription: parsed.meta.seoDescription || null,
      slug,
      tags: [],
      category: null, // user assigns category in editor; difficulty stored separately
      aiGenerated: true,
      createdByUserId: "system",
    },
  });

  // Link reference uploads to the created article
  await prisma.refUpload.updateMany({
    where: { id: { in: input.refUploadIds } },
    data: { articleId: article.id },
  });

  const durationMs = Date.now() - t0;
  console.log(
    `[draft-from-refs] Created article ${article.id} — ${parsed.blocks.length} blocks, ${durationMs}ms`,
  );

  return {
    articleId: article.id,
    title,
    blockCount: parsed.blocks.length,
    durationMs,
  };
}
```

- [ ] **Step 4: Create generate-draft API route**

```typescript
// src/app/api/content-factory/generate-draft/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateDraftFromRefs } from "@/lib/content-factory/draft-from-refs";

export const maxDuration = 300; // 5 min for streaming

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refUploadIds, topic, userNotes } = body;

    if (!Array.isArray(refUploadIds) || !refUploadIds.length) {
      return NextResponse.json({ error: "refUploadIds required" }, { status: 400 });
    }

    const result = await generateDraftFromRefs({ refUploadIds, topic, userNotes });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-draft] Error:", err);
    const message = err instanceof Error ? err.message : "Draft generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add prompts/ src/lib/content-factory/draft-from-refs.ts "src/app/api/content-factory/generate-draft/route.ts"
git commit -m "feat: AI draft generation from reference uploads (Claude streaming)"
```

---

## Chunk 3: "New Article" Upload Page

### Task 6: Create the upload & draft UI

**Files:**
- Create: `src/app/content-factory/new/page.tsx`
- Create: `src/app/content-factory/new/page.module.css`

- [ ] **Step 1: Create the page component**

This is the main new user-facing flow. It has:
1. **Drop zone** — drag-and-drop or file picker for PDF/DOCX (multi-file)
2. **URL input** — add a link as reference (stretch goal, can be Phase 2)
3. **Topic field** — optional text input for article topic/angle
4. **Notes field** — optional textarea for specific instructions
5. **Upload indicators** — show uploaded file names + extracted char counts
6. **"צור טיוטה" button** — triggers draft generation, shows progress, redirects to article editor on success

The page follows the existing design system (CSS Modules, tokens, Card component).

Key UX flow:
- User drops files → files upload to `/api/content-factory/upload-refs` → previews appear
- User optionally fills topic + notes
- User clicks "צור טיוטה" → POST to `/api/content-factory/generate-draft` → loading state → redirect to `/content-factory/articles/{id}`

The component should use the same drag-and-drop pattern from ContentEngineClient (reusable: dragCount tracking, validation) but simplified.

- [ ] **Step 2: Create the page styles**

Follow existing `page.module.css` patterns:
- `.uploadZone` — dashed border, hover highlight, drag-over state with gold border
- `.fileList` — uploaded file pills with name + char count
- `.formFields` — topic + notes inputs
- `.generateBtn` — primary button, disabled during generation, loading spinner

- [ ] **Step 3: Verify build and test locally**

Run: `npx tsc --noEmit && npx next build`

- [ ] **Step 4: Commit**

```bash
git add src/app/content-factory/new/
git commit -m "feat: new article upload page — drop refs, generate AI draft"
```

---

## Chunk 4: Enhanced Sanity Push

### Task 7: Upgrade Sanity mapper to populate all fields

**Files:**
- Modify: `src/lib/sanity/mapper.ts`
- Modify: `src/lib/content-factory/publishers/sanity-publisher.ts`

The current mapper is missing several Sanity article fields. The enhanced push should populate:
- `title` ✅ (already done)
- `slug` ✅ (already done)
- `body` (Portable Text) ✅ (already done)
- `authors[]` — resolve author refs (use `authors` array field, NOT deprecated `author`)
- `categories[]` — resolve category refs (use `categories` array field, NOT deprecated `category`)
- `tags[]` — resolve tag refs ✅ (already done)
- `publishedAt` ✅ (already done)
- `excerpt` — from `meta.excerpt` or `article.subtitle`
- `tldr` — from `meta.tldr`
- `difficulty` — from `meta.difficulty`
- `checklist` — convert `meta.checklist` strings to Portable Text blocks
- `seoTitle` ✅ (already done)
- `seoDescription` ✅ (already done)
- `disclaimer` — standard AI disclaimer text
- `contentType` — default "article"
- `mainImage` — if image has been generated (see Task 8)

- [ ] **Step 1: Update mapper to use array fields and populate all Sanity fields**

Key changes to `mapper.ts`:

**Type changes in `SanityArticleDoc` interface:**
- `author?: SanityRef` → `authors?: (SanityRef & { _key: string })[]`
- `category?: SanityRef` → `categories?: (SanityRef & { _key: string })[]`
- Add `excerpt?: string`
- Add `contentType?: string`
- Add `checklist?: SanityPortableTextBlock[]` (NOT `string[]` — Sanity schema requires PT blocks)

**`_key` generation:** Every item in a Sanity array MUST have a `_key` field. Use `crypto.randomBytes(6).toString('hex')` for each array item (already done correctly for `tags` in the existing mapper).

**Checklist conversion:** Each checklist string must be wrapped in a Portable Text block:
```typescript
function checklistToPortableText(items: string[]): object[] {
  return items.map((text) => ({
    _type: "block",
    _key: crypto.randomBytes(6).toString("hex"),
    style: "normal",
    children: [{ _type: "span", _key: crypto.randomBytes(6).toString("hex"), text, marks: [] }],
    markDefs: [],
  }));
}
```

**Author/category resolution:** Use the existing `resolveAuthorRef()` / `resolveCategoryRef()` from `reference-cache.ts`, but wrap results in arrays with `_key`.

**distributionStatus:** The `push-to-sanity` route MUST update `article.sanityId`, `article.sanityUrl`, and `article.distributionStatus` after a successful push. The existing `sanity-publisher.ts` already does this — reuse that logic.

- [ ] **Step 2: Update sanity-publisher to pass full article data**

Ensure the publisher loads all needed fields from the Article record and passes them through the mapper.

- [ ] **Step 3: Create push-to-sanity enhanced route**

File: `src/app/api/content-factory/articles/[id]/push-to-sanity/route.ts`

This is a dedicated route for the V2 flow (separate from the existing `publish-website` route which can remain for backward compat).

- [ ] **Step 4: Commit**

```bash
git add src/lib/sanity/mapper.ts src/lib/content-factory/publishers/sanity-publisher.ts "src/app/api/content-factory/articles/[id]/push-to-sanity/route.ts"
git commit -m "feat: enhanced Sanity push — all article fields populated (authors[], categories[], checklist, excerpt)"
```

---

## Chunk 5: AI Image Generation

### Task 8: Gemini Imagen 4 integration

**Files:**
- Create: `src/lib/content-factory/image-generator.ts`
- Create: `src/app/api/content-factory/articles/[id]/generate-image/route.ts`

- [ ] **Step 1: Create image generator module**

Uses Gemini Imagen 4 (`imagen-4.0-fast-generate-001`) — same approach as the website's `generate-article-images.mjs` but as a server-side module.

Flow:
1. Takes article title + category → builds image prompt (navy/gold brand palette, watercolor editorial style, NO Hebrew text)
2. Calls Gemini API → gets base64 PNG
3. Uploads to Sanity as image asset
4. Returns Sanity image reference (`_type: "image"`, asset ref)

Requires env var: `GOOGLE_AI_API_KEY`

- [ ] **Step 2: Create API route**

POST `/api/content-factory/articles/[id]/generate-image`

Generates image → uploads to Sanity → optionally patches the Sanity document's `mainImage` field if the article has already been pushed.

- [ ] **Step 3: Add "generate image" button to article editor**

In `articles/[id]/page.tsx`, add a button near the Sanity publish section:
- "צור תמונה" button → calls generate-image API → shows preview → confirms

- [ ] **Step 4: Commit**

```bash
git add src/lib/content-factory/image-generator.ts "src/app/api/content-factory/articles/[id]/generate-image/route.ts" "src/app/content-factory/articles/[id]/page.tsx"
git commit -m "feat: AI image generation (Gemini Imagen 4) + Sanity upload"
```

---

## Chunk 6: Content Factory Hub Redesign

### Task 9: Redesign hub as article-centric view

**Files:**
- Modify: `src/app/content-factory/page.tsx`
- Modify: `src/app/content-factory/page.module.css`

- [ ] **Step 1: Redesign the hub page**

The new hub should show:
1. **Top CTA** — "מאמר חדש +" button (links to `/content-factory/new`)
2. **Article list** — table/card grid of all articles with: title, status badge, date, Sanity status (pushed/not pushed), actions
3. **Quick stats** — total articles, drafts pending, published count
4. Remove the old pipeline visualization (sources → ideas → articles flow diagram)

- [ ] **Step 2: Update styles**

- [ ] **Step 3: Commit**

```bash
git add src/app/content-factory/page.tsx src/app/content-factory/page.module.css
git commit -m "feat: redesign Content Factory hub — article-centric with 'new article' CTA"
```

---

## Chunk 7: Newsletter Integration (Phase 1 — Manual Trigger)

### Task 10: Summit newsletter sender

**Files:**
- Create: `src/lib/content-factory/newsletter-sender.ts`
- Create: `src/app/api/content-factory/newsletter/route.ts`

**Context:** Summit CRM at app.sumit.co.il handles email distribution. The website has 3 branded HTML templates in `outputs/` (newsletter-1-article.html, newsletter-2-update.html, newsletter-3-custom.html). The Summit MCP has `summit_send_document_email` and `summit_add_email_subscriber` tools. For Phase 1, we'll prepare the newsletter content and provide a one-click flow, but the actual send may still require Summit UI paste if the API doesn't support campaign sends directly.

- [ ] **Step 1: Create newsletter-sender module**

This module:
1. Takes an article (title, excerpt, slug, image URL)
2. Renders into the branded HTML template (navy header, gold CTA, RTL Hebrew)
3. Returns the rendered HTML for preview
4. Optionally sends via Summit API if available, or provides copy-paste-ready HTML

- [ ] **Step 2: Create newsletter API route**

POST `/api/content-factory/newsletter`
Body: `{ articleId, templateType: "article" | "update" | "custom" }`

Returns: `{ html, previewText, subject }`

The article editor will have a "שלח ניוזלטר" button that:
1. Calls this API to generate the newsletter HTML
2. Shows a preview modal
3. Either sends via Summit API or shows "copy to Summit" instructions

- [ ] **Step 3: Add newsletter button to article editor**

In the article editor, after the article is published to Sanity, show:
- "שלח ניוזלטר" button → generates newsletter → preview → send/copy

- [ ] **Step 4: Commit**

```bash
git add src/lib/content-factory/newsletter-sender.ts "src/app/api/content-factory/newsletter/route.ts"
git commit -m "feat: newsletter preparation from published articles (Summit integration Phase 1)"
```

---

## Chunk 8: Article Editor UX Enhancements

### Task 11: Add push-to-Sanity + image + newsletter buttons to editor

**Files:**
- Modify: `src/app/content-factory/articles/[id]/page.tsx`
- Modify: `src/app/content-factory/articles/[id]/page.module.css`

- [ ] **Step 1: Add action bar to article editor**

Below the block editor and above the existing asset section, add a new "Publishing Actions" section:

```
┌─────────────────────────────────────────────────┐
│  פעולות פרסום                                    │
│                                                   │
│  [צור תמונה]  [העבר לאתר]  [שלח ניוזלטר]       │
│                                                   │
│  Status: ⬡ לא הועבר / ✅ הועבר לאתר              │
│  Sanity: https://bitancpa.com/studio/...          │
└─────────────────────────────────────────────────┘
```

Each button:
- **צור תמונה** — calls `/api/content-factory/articles/[id]/generate-image`, shows spinner, then preview
- **העבר לאתר** — calls `/api/content-factory/articles/[id]/push-to-sanity`, shows spinner, then success with Sanity Studio link
- **שלח ניוזלטר** — only visible after push-to-Sanity, calls newsletter API, shows preview modal

- [ ] **Step 2: Style the action bar**

Follow design system: Card wrapper, gold separator, button group with spacing.

- [ ] **Step 3: Commit**

```bash
git add "src/app/content-factory/articles/[id]/page.tsx" "src/app/content-factory/articles/[id]/page.module.css"
git commit -m "feat: article editor — push to Sanity, generate image, send newsletter buttons"
```

---

## Chunk 9: CLAUDE.md + Final Cleanup

### Task 12: Update CLAUDE.md and documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with V2 architecture**

Document:
- New Content Factory flow (upload → draft → edit → push → image → newsletter)
- Removed Content Engine
- New API routes
- New file structure
- Updated nav structure
- Env vars needed: `GOOGLE_AI_API_KEY` for Imagen 4

- [ ] **Step 1b: Clean up Dockerfile**

Strip Content Engine references from `Dockerfile`:
- Remove Python/jinja2 install (only needed for DOCX→PDF engine)
- Remove `CONTENT_ENGINE_DIR` env var
- Keep Chromium (still needed for browser scraping)

- [ ] **Step 1c: Copy newsletter templates into OS Hub**

Copy the 3 branded HTML email templates from `/Users/shay/bitan-bitan-website/outputs/` into the OS Hub repo (e.g., `src/lib/content-factory/templates/`). These are needed by `newsletter-sender.ts` and shouldn't cross-reference the website repo at runtime.

- [ ] **Step 2: Final build verification**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Content Factory V2 architecture"
```

---

## Implementation Order & Dependencies

```
Chunk 1 (cleanup)     → no dependencies, do first
Chunk 2 (upload+AI)   → depends on Chunk 1 (nav must exist)
Chunk 3 (upload page) → depends on Chunk 2 (APIs must exist)
Chunk 4 (Sanity push) → independent of Chunks 2-3, can parallel
Chunk 5 (image gen)   → independent, needs GOOGLE_AI_API_KEY env var
Chunk 6 (hub redesign)→ depends on Chunk 1 (nav), can parallel with 2-5
Chunk 7 (newsletter)  → depends on Chunk 4 (needs published articles)
Chunk 8 (editor UX)   → depends on Chunks 4, 5, 7 (wires all buttons)
Chunk 9 (docs)        → last, after everything works
```

**Parallelizable groups:**
- Group A: Chunks 1, 4, 5, 6 (all independent)
- Group B: Chunks 2, 3 (sequential, upload → page)
- Group C: Chunks 7, 8, 9 (sequential, newsletter → editor → docs)

---

## Key Decision Points (for implementer)

1. **Article editor quality** — The existing block editor is functional but basic. If Ron finds it frustrating vs. Sanity's editor, consider adding rich text (e.g., Tiptap) in a future iteration. For V2, the existing block editor + push-to-Sanity flow should work.

2. **Newsletter send mechanism** — Summit API may not support direct campaign sends. Phase 1 generates the HTML; if Summit API supports it, auto-send. If not, show "copy to Summit" with rendered HTML.

3. **Image generation env var** — `GOOGLE_AI_API_KEY` must be set on Railway for Imagen 4 to work. The implementer should add it or flag it.

4. **pdf-parse + mammoth in Docker** — These are pure JS libraries, should work in the existing Docker image without changes. Verify during build.

5. **Content Engine API routes** — Left in place for Chunk 1 to keep the change small. Can be deleted in a follow-up cleanup commit.
