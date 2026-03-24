/**
 * Article → Sanity document mapper.
 *
 * Creates complete Sanity article documents with resolved references,
 * Portable Text body, SEO fields, and AI disclaimer.
 *
 * V2: Uses array fields (authors[], categories[]) matching the website schema.
 */

import crypto from "crypto";
import { convertBlocksToPortableText, type PTBlock } from "./portable-text";
import { slugifyHebrew } from "./slugify";
import { resolveAuthorRef, resolveCategoryRef, resolveTagRefs } from "./reference-cache";

// ── Types ───────────────────────────────────────────────────────────────────

interface SanityRef {
  _type: "reference";
  _ref: string;
  _key: string;
}

interface SanityPTBlock {
  _type: "block";
  _key: string;
  style: string;
  children: Array<{ _type: "span"; _key: string; text: string; marks: string[] }>;
  markDefs: Array<Record<string, unknown>>;
}

export interface SanityArticleDoc {
  _type: "article";
  _id: string;
  title: string;
  slug: { _type: "slug"; current: string };
  publishedAt: string;
  body: PTBlock[];
  seoTitle?: string;
  seoDescription?: string;
  authors?: SanityRef[];
  categories?: SanityRef[];
  tags?: SanityRef[];
  excerpt?: string;
  tldr?: string;
  difficulty?: string;
  checklist?: SanityPTBlock[];
  disclaimer?: string;
  contentType?: string;
  mainImage?: { _type: "image"; asset: { _type: "reference"; _ref: string } };
}

interface ArticleInput {
  id: string;
  title: string;
  subtitle?: string | null;
  bodyBlocks: unknown;
  tags?: string[];
  category?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  slug?: string | null;
  aiGenerated?: boolean;
  excerpt?: string | null;
  difficulty?: string | null;
  checklist?: string[] | null;
  sanityImageRef?: string | null;
}

interface MapperOptions {
  authorName?: string;
  asDraft?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function genKey(): string {
  return crypto.randomBytes(6).toString("hex");
}

/**
 * Convert checklist strings to Portable Text blocks (required by Sanity schema).
 */
function checklistToPortableText(items: string[]): SanityPTBlock[] {
  return items.map((text) => ({
    _type: "block" as const,
    _key: genKey(),
    style: "normal",
    children: [{ _type: "span" as const, _key: genKey(), text, marks: [] }],
    markDefs: [],
  }));
}

// ── Default references (hardcoded Sanity _ids) ─────────────────────────────

const DEFAULT_AUTHORS = [
  { _type: "reference" as const, _ref: "author-ron", _key: genKey() },
  { _type: "reference" as const, _ref: "author-avi", _key: genKey() },
];

// מס הכנסה — most common category for Bitan articles
const DEFAULT_CATEGORY_ID = "10f65318-c333-4186-8080-5fdf932bef9f";

// Standard disclaimer (no mention of AI)
const STANDARD_DISCLAIMER =
  "המידע במאמר זה הינו כללי ואינו מהווה תחליף לייעוץ מקצועי פרטני. לקבלת ייעוץ מותאם, פנו למשרדנו.";

// ── Mapper ──────────────────────────────────────────────────────────────────

export async function mapArticleToSanityDoc(
  article: ArticleInput,
  options?: MapperOptions,
): Promise<SanityArticleDoc> {
  const isDraft = options?.asDraft ?? true;
  const idPrefix = isDraft ? "drafts." : "";

  // Resolve references — use array fields (authors[], categories[])
  const authorRef = options?.authorName
    ? await resolveAuthorRef(options.authorName)
    : null;
  if (options?.authorName && !authorRef) {
    console.warn("[mapper] Author not found in Sanity:", options.authorName);
  }
  const categoryRef = article.category
    ? await resolveCategoryRef(article.category)
    : null;
  const tagRefs = article.tags?.length
    ? await resolveTagRefs(article.tags)
    : [];

  const slug = article.slug || slugifyHebrew(article.title);

  // Convert body blocks to Portable Text
  const blocks = Array.isArray(article.bodyBlocks) ? article.bodyBlocks : [];
  const body = convertBlocksToPortableText(
    blocks as Array<{ type: string; text?: string; level?: number; items?: string[]; style?: string; attribution?: string; title?: string; headers?: string[]; rows?: string[][] }>,
  );

  const doc: SanityArticleDoc = {
    _type: "article",
    _id: `${idPrefix}cf-${article.id}`,
    title: article.title,
    slug: { _type: "slug", current: slug },
    publishedAt: new Date().toISOString(),
    body,
    seoTitle: article.seoTitle || article.title,
    seoDescription: article.seoDescription || article.subtitle || undefined,
    contentType: "article",
  };

  // Authors — always default to Ron + Avi if no specific author resolved
  if (authorRef) {
    doc.authors = [{ _type: "reference", _ref: authorRef, _key: genKey() }];
  } else {
    doc.authors = DEFAULT_AUTHORS.map((a) => ({ ...a, _key: genKey() }));
  }

  // Categories — use resolved category or default to מס הכנסה
  if (categoryRef) {
    doc.categories = [{ _type: "reference", _ref: categoryRef, _key: genKey() }];
  } else {
    doc.categories = [{ _type: "reference", _ref: DEFAULT_CATEGORY_ID, _key: genKey() }];
  }

  // Tags (array field with _key)
  if (tagRefs.length > 0) {
    doc.tags = tagRefs.map((ref) => ({
      _type: "reference" as const,
      _ref: ref,
      _key: genKey(),
    }));
  }

  // Excerpt
  if (article.excerpt || article.subtitle) {
    doc.excerpt = article.excerpt || article.subtitle || undefined;
  }

  // TL;DR
  if (article.subtitle) {
    doc.tldr = article.subtitle;
  }

  // Difficulty
  if (article.difficulty) {
    doc.difficulty = article.difficulty;
  }

  // Checklist → Portable Text blocks
  if (article.checklist?.length) {
    doc.checklist = checklistToPortableText(article.checklist);
  }

  // Main image (if already generated and pushed to Sanity)
  if (article.sanityImageRef) {
    doc.mainImage = {
      _type: "image",
      asset: { _type: "reference", _ref: article.sanityImageRef },
    };
  }

  // Standard disclaimer (never mention AI)
  doc.disclaimer = STANDARD_DISCLAIMER;
  if (!doc.difficulty) doc.difficulty = "basic";

  return doc;
}
