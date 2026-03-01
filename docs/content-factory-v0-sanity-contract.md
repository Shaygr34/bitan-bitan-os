# Content Factory v0 — Sanity Integration Contract

**Supplements:** `content-factory-v0-master-plan.md` (Sections 6, PR-07, PR-08)  
**Source:** Sanity schema snapshot from `bitan-bitan-website` repo  
**Date:** 2026-03-01  

---

## 1. Key Findings from Schema

| Finding | Implication |
|---------|-------------|
| Target type is `article` (not `post`) | Mapper uses `_type: "article"` |
| Body is standard Portable Text (no custom blocks) | Our ContentBlock → PT converter only needs: block styles (h1–h4, normal, blockquote), decorators (strong, em, underline, strike, code), annotations (link), lists (bullet, number), inline images |
| `author`, `category`, `tags` are **references** | Must resolve Sanity `_id` values before creating articles. Requires a one-time lookup + cache strategy. |
| `publishedAt` does NOT gate visibility | Sanity publish state (drafts. prefix) is the only visibility control |
| ISR = 300s (5 min) | After publish, article appears on website within 5 minutes. No cache-busting needed. |
| Hebrew slugify already defined | We replicate the same function in the OS Hub for consistency |
| Extra fields: `tldr`, `difficulty`, `checklist`, `disclaimer` | CF populates these from AI drafting. `disclaimer` has a frontend default fallback. |
| No custom block types in body | Simplifies converter significantly. Only standard blocks + inline images. |

---

## 2. Publish Strategy (Finalized)

**Decision: Create as Sanity draft → Partner publishes in Studio.**

```
OS Hub: Article APPROVED → "Publish to Website" clicked
                │
                ▼
Sanity: Document created with _id = "drafts.cf-{article.id}"
                │
                ▼  
Partner: Opens Sanity Studio link → clicks Publish → article goes live
                │
                ▼
Website: Appears within 5 minutes (ISR revalidation)
```

**Why draft, not immediate publish:**
- Partners want visual confirmation on the actual site layout before going live
- Sanity Studio is already familiar to them (they use it for other content)
- The "Publish" click in Studio is a one-second safety net
- In v1, we can add a "Publish Immediately" option that skips the draft step

**Document ID convention:** `drafts.cf-{article.id}` 
- `cf-` prefix prevents collision with manually created Sanity documents
- `article.id` provides deterministic mapping (idempotent re-publishes)
- When published in Studio, Sanity creates a copy without the `drafts.` prefix

---

## 3. Reference Resolution Strategy

The `article` schema references `author`, `category`, and `tag` documents by Sanity `_id`. The Content Factory needs to resolve these before creating articles.

### Approach: Fetch-once, cache in memory, refresh on miss

```typescript
// src/lib/sanity/reference-cache.ts

interface SanityRefCache {
  authors: Map<string, string>;      // name → _id
  categories: Map<string, string>;   // title → _id
  tags: Map<string, string>;         // title → _id
  lastRefreshed: Date;
}

// Refresh cache on first publish, then every 24 hours or on cache miss
async function resolveAuthorRef(name: string): Promise<string | null> {
  // 1. Check cache
  // 2. On miss: query Sanity `*[_type == "author" && name == $name][0]._id`
  // 3. Still null? Return null (optional field — article works without author ref)
}

async function resolveCategoryRef(title: string): Promise<string | null> {
  // 1. Check cache
  // 2. On miss: query by title OR slug
  // 3. Still null? Auto-create the category in Sanity, return new _id
}

async function resolveTagRef(title: string): Promise<string> {
  // 1. Check cache
  // 2. On miss: query by title OR slug
  // 3. Still null? Auto-create the tag in Sanity, return new _id
}
```

### Default mappings (v0)

| CF Field | Sanity Reference | Resolution |
|----------|-----------------|------------|
| Article created by Avi → `author: "אבי ביטן"` | `author._ref` → Avi's Sanity _id | Cache on first use |
| Article created by Ron → `author: "רון ביטן"` | `author._ref` → Ron's Sanity _id | Cache on first use |
| AI-generated article → no specific author | `author._ref` → `null` (skip field) | Or use a default "ביטן את ביטן" author |
| `article.category = "Tax"` | `category._ref` → `"מס הכנסה"` Sanity _id | Category title mapping table |
| `article.tags = ["income-tax", "compliance"]` | `tags[]._ref` → resolved or auto-created tag _ids | Auto-create on miss |

### Category mapping table (CF internal tag → Sanity category title)

```typescript
const CATEGORY_MAP: Record<string, string> = {
  'Tax':           'מס הכנסה',
  'Payroll':       'שכר',
  'Legal':         'מס הכנסה',    // no separate "Legal" category in Sanity — map to closest
  'Regulation':    'מס הכנסה',
  'Grants':        'חברות',        // closest fit
  'Business-News': 'חברות',
  'Markets':       'חברות',
};
// Seeded Sanity categories: מס הכנסה, מע"מ, ביטוח לאומי, חברות, שכר
```

---

## 4. ContentBlock → Portable Text Converter

This is the core transformation. Our `ContentBlock[]` (from article.bodyBlocks) must become Sanity Portable Text blocks.

### Mapping Table

| ContentBlock type | Sanity block style | Notes |
|-------------------|--------------------|-------|
| `heading` level 1 | `h1` | |
| `heading` level 2 | `h2` | |
| `heading` level 3 | `h3` | |
| `paragraph` | `normal` | Parse inline marks |
| `list` (bullet) | `normal` + `listItem: "bullet"` | Each item is a separate block |
| `list` (numbered) | `normal` + `listItem: "number"` | Each item is a separate block |
| `quote` | `blockquote` | Attribution as separate normal block if present |
| `callout` | `blockquote` | Sanity has no callout type; degrade gracefully |
| `divider` | (skip) | Sanity has no HR block; omit |
| `table` | (flatten) | Sanity standard PT has no tables; convert to text paragraphs |
| `image` | inline image block | Requires uploading image asset to Sanity first (skip in v0) |

### Inline Mark Parsing

ContentBlock text fields may contain: `**bold**`, `*italic*`, `[link text](url)`

```typescript
// src/lib/sanity/portable-text.ts

interface PTSpan {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];  // decorator names or markDef keys
}

interface PTMarkDef {
  _type: 'link';
  _key: string;
  href: string;
}

function parseInlineMarks(text: string): { children: PTSpan[], markDefs: PTMarkDef[] } {
  const children: PTSpan[] = [];
  const markDefs: PTMarkDef[] = [];
  // Regex-based parser for **bold**, *italic*, [link](url)
  // Split text into segments, each with appropriate marks
  return { children, markDefs };
}
```

### Full Converter Implementation

```typescript
// src/lib/sanity/portable-text.ts

import { randomUUID } from 'crypto';

function generateKey(): string {
  return randomUUID().slice(0, 8);
}

export function convertBlocksToPortableText(blocks: ContentBlock[]): PortableTextBlock[] {
  const result: PortableTextBlock[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const { children, markDefs } = parseInlineMarks(block.text);
        result.push({
          _type: 'block', _key: generateKey(),
          style: `h${block.level}`, markDefs, children,
        });
        break;
      }
      case 'paragraph': {
        const { children, markDefs } = parseInlineMarks(block.text);
        result.push({
          _type: 'block', _key: generateKey(),
          style: 'normal', markDefs, children,
        });
        break;
      }
      case 'list': {
        const listType = block.style === 'bullet' ? 'bullet' : 'number';
        for (const item of block.items) {
          const { children, markDefs } = parseInlineMarks(item);
          result.push({
            _type: 'block', _key: generateKey(),
            style: 'normal', listItem: listType, level: 1,
            markDefs, children,
          });
        }
        break;
      }
      case 'quote': {
        const { children, markDefs } = parseInlineMarks(block.text);
        result.push({
          _type: 'block', _key: generateKey(),
          style: 'blockquote', markDefs, children,
        });
        if (block.attribution) {
          result.push({
            _type: 'block', _key: generateKey(),
            style: 'normal', markDefs: [],
            children: [{
              _type: 'span', _key: generateKey(),
              text: `— ${block.attribution}`, marks: ['em'],
            }],
          });
        }
        break;
      }
      case 'callout': {
        const title = block.title ? `${block.title}: ` : '';
        const { children, markDefs } = parseInlineMarks(`${title}${block.text}`);
        result.push({
          _type: 'block', _key: generateKey(),
          style: 'blockquote', markDefs, children,
        });
        break;
      }
      case 'table': {
        if (block.headers.length > 0) {
          result.push({
            _type: 'block', _key: generateKey(),
            style: 'normal', markDefs: [],
            children: [{ _type: 'span', _key: generateKey(), text: block.headers.join(' | '), marks: ['strong'] }],
          });
        }
        for (const row of block.rows) {
          result.push({
            _type: 'block', _key: generateKey(),
            style: 'normal', markDefs: [],
            children: [{ _type: 'span', _key: generateKey(), text: row.join(' | '), marks: [] }],
          });
        }
        break;
      }
      case 'divider':
        break; // skip
      case 'image':
        break; // skip in v0 (AI articles won't have inline images)
    }
  }
  return result;
}
```

---

## 5. Article → Sanity Document Mapper (Finalized)

```typescript
// src/lib/sanity/mapper.ts

export async function mapArticleToSanityDoc(
  article: Article,
  options?: { authorName?: string; asDraft?: boolean }
): Promise<SanityArticleDoc> {
  const isDraft = options?.asDraft ?? true;
  const idPrefix = isDraft ? 'drafts.' : '';
  
  // Resolve references
  const authorRef = options?.authorName 
    ? await resolveAuthorRef(options.authorName) : null;
  const categoryRef = article.category 
    ? await resolveCategoryRef(article.category) : null;
  const tagRefs = article.tags?.length 
    ? await resolveTagRefs(article.tags) : [];

  const slug = article.slug || slugifyHebrew(article.title);
  const body = convertBlocksToPortableText(article.bodyBlocks as ContentBlock[]);
  const tldr = article.subtitle || null;

  const doc: SanityArticleDoc = {
    _type: 'article',
    _id: `${idPrefix}cf-${article.id}`,
    title: article.title,
    slug: { _type: 'slug', current: slug },
    publishedAt: new Date().toISOString(),
    body,
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.subtitle || undefined,
  };

  if (authorRef) doc.author = { _type: 'reference', _ref: authorRef };
  if (categoryRef) doc.category = { _type: 'reference', _ref: categoryRef };
  if (tagRefs.length > 0) {
    doc.tags = tagRefs.map((ref, i) => ({ _type: 'reference', _ref: ref, _key: `tag-${i}` }));
  }
  if (tldr) doc.tldr = tldr;
  
  if (article.aiGenerated) {
    doc.difficulty = 'basic';
    doc.disclaimer = 'מאמר זה נכתב בסיוע בינה מלאכותית ונערך על ידי צוות רו"ח ביטן את ביטן. המידע הינו כללי ואינו מהווה תחליף לייעוץ מקצועי פרטני.';
  }

  return doc;
}
```

### Hebrew Slugify (matching Sanity's implementation exactly)

```typescript
// src/lib/sanity/slugify.ts

export function slugifyHebrew(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, '')
    .slice(0, 96);
}
```

---

## 6. Sanity Publish Flow (Detailed)

```typescript
// src/lib/content-factory/publishers/sanity-publisher.ts

export async function publishToSanity(
  article: Article,
  publishedBy: { id: string; name: string }
): Promise<PublishResult> {
  try {
    if (article.editorialStatus !== 'APPROVED') {
      return { success: false, error: 'Article must be APPROVED' };
    }
    if (article.sanityId) {
      return { success: false, error: `Already published: ${article.sanityId}` };
    }

    const sanityDoc = await mapArticleToSanityDoc(article, {
      authorName: publishedBy.name,
      asDraft: true,
    });

    await logEvent({ /* SANITY_PUBLISH_STARTED */ });

    const result = await sanityWriteClient.createOrReplace(sanityDoc);
    const sanityId = result._id;
    const studioUrl = `https://bitan-bitan.sanity.studio/desk/article;${sanityId}`;
    const websiteUrl = `https://www.bitan-bitan.co.il/knowledge/${sanityDoc.slug.current}`;

    await logEvent({ /* SANITY_PUBLISH_SUCCEEDED */ });

    return { success: true, sanityId, studioUrl, websiteUrl };
  } catch (error) {
    await logEvent({ /* SANITY_PUBLISH_FAILED */ });
    return { success: false, error: `Sanity publish failed: ${error.message}` };
  }
}
```

---

## 7. AI Drafting → Sanity-Aware Fields

The article drafting prompt (PR-06) should instruct Claude to generate additional fields that map directly to Sanity:

```
בנוסף לגוף המאמר, ספק בתחילת התשובה:

{
  "meta": {
    "seoTitle": "כותרת SEO — עד 60 תווים, כולל '| ביטן את ביטן'",
    "seoDescription": "תיאור מטא — עד 155 תווים",
    "excerpt": "תקציר של 2-3 משפטים",
    "tldr": "סיכום של 2-3 משפטים — מה הקורא צריך לדעת",
    "difficulty": "basic|intermediate|advanced",
    "checklist": ["צעד מעשי 1", "צעד מעשי 2", "צעד מעשי 3"]
  },
  "blocks": [...]
}
```

This means the drafting service (PR-06) extracts both meta fields and body blocks from the AI response.

---

## 8. Updated Acceptance Criteria

### PR-07: Sanity Client + Schema Mapping + Portable Text

- [ ] Sanity write client connects with credentials from env
- [ ] Can create a draft document in Sanity (`_id` prefixed with `drafts.cf-`)
- [ ] ContentBlock → Portable Text handles: heading (h1–h3), paragraph, list (bullet + numbered), quote, callout (→ blockquote), table (→ flattened text)
- [ ] Inline marks parsed: `**bold**` → `strong`, `*italic*` → `em`, `[link](url)` → markDef
- [ ] Hebrew text preserved correctly through full pipeline
- [ ] Slug matches Sanity's slugify exactly
- [ ] Author reference resolved by name ("אבי ביטן" → Sanity _id)
- [ ] Category reference resolved with mapping table
- [ ] Tag references auto-created in Sanity if not found
- [ ] AI-generated articles get default disclaimer text
- [ ] Unit tests for: each block type conversion, inline mark parsing, slugify, reference resolution

### PR-08: Publish to Sanity — End-to-End

```
POST /api/content-factory/articles/[id]/publish-website
  → 201: { publishJobId, sanityId, studioUrl, websiteUrl }
  → 400: { error: "Article must be APPROVED" }
  → 409: { error: "Already published", sanityId }
  → 500: { error: "Sanity publish failed", details }
```

- [ ] "Publish to Website" button on APPROVED articles
- [ ] Creates Sanity document as draft
- [ ] Shows Studio link + website preview link
- [ ] Hebrew note: "לאחר פרסום בסטודיו, המאמר יופיע באתר תוך 5 דקות"
- [ ] Cannot publish same article twice
- [ ] Error handling with retry option

---

## 9. Edge Cases

| Edge case | Handling |
|-----------|----------|
| Title contains quotes/special chars | slugifyHebrew strips them |
| Duplicate slug in Sanity | `createOrReplace` with deterministic `_id` is idempotent |
| Category not in mapping table | Falls back to `null` (optional field) |
| Tag creation race condition | Use `createIfNotExists` |
| Empty body (zero blocks) | Valid — Sanity body field is not required |
| Re-publish same article | 409 with existing sanityId |
| Partner deletes draft in Studio | CF still shows "Published" — acceptable for v0 |
