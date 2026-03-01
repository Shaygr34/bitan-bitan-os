/**
 * Article → Sanity document mapper.
 *
 * Creates complete Sanity article documents with resolved references,
 * Portable Text body, SEO fields, and AI disclaimer.
 */

import { convertBlocksToPortableText, type PTBlock } from "./portable-text";
import { slugifyHebrew } from "./slugify";
import { resolveAuthorRef, resolveCategoryRef, resolveTagRefs } from "./reference-cache";

// ── Types ───────────────────────────────────────────────────────────────────

interface SanityRef {
  _type: "reference";
  _ref: string;
  _key?: string;
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
  author?: SanityRef;
  category?: SanityRef;
  tags?: SanityRef[];
  tldr?: string;
  difficulty?: string;
  checklist?: string[];
  disclaimer?: string;
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
}

interface MapperOptions {
  authorName?: string;
  asDraft?: boolean;
}

// ── Mapper ──────────────────────────────────────────────────────────────────

export async function mapArticleToSanityDoc(
  article: ArticleInput,
  options?: MapperOptions,
): Promise<SanityArticleDoc> {
  const isDraft = options?.asDraft ?? true;
  const idPrefix = isDraft ? "drafts." : "";

  // Resolve references
  const authorRef = options?.authorName
    ? await resolveAuthorRef(options.authorName)
    : null;
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
  };

  if (authorRef) {
    doc.author = { _type: "reference", _ref: authorRef };
  }
  if (categoryRef) {
    doc.category = { _type: "reference", _ref: categoryRef };
  }
  if (tagRefs.length > 0) {
    doc.tags = tagRefs.map((ref, i) => ({
      _type: "reference" as const,
      _ref: ref,
      _key: `tag-${i}`,
    }));
  }
  if (article.subtitle) {
    doc.tldr = article.subtitle;
  }

  if (article.aiGenerated) {
    doc.difficulty = "basic";
    doc.disclaimer =
      "מאמר זה נכתב בסיוע בינה מלאכותית ונערך על ידי צוות רו\"ח ביטן את ביטן. המידע הינו כללי ואינו מהווה תחליף לייעוץ מקצועי פרטני.";
  }

  return doc;
}
