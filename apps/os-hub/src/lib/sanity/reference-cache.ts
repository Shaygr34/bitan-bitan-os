/**
 * Sanity reference resolution with in-memory cache.
 *
 * Resolves author, category, and tag references by name/title.
 * Auto-creates tags on miss. Categories mapped via CF → Sanity title table.
 */

import { query, createIfNotExists } from "./client";
import { slugifyHebrew } from "./slugify";

// ── Category mapping (CF internal → Sanity category title) ──────────────────

const CATEGORY_MAP: Record<string, string> = {
  Tax: "מס הכנסה",
  Payroll: "שכר",
  Legal: "מס הכנסה",
  Regulation: "מס הכנסה",
  Grants: "חברות",
  "Business-News": "חברות",
  Markets: "חברות",
};

// ── Cache ───────────────────────────────────────────────────────────────────

interface RefCache {
  authors: Map<string, string>;    // name → _id
  categories: Map<string, string>; // title → _id
  tags: Map<string, string>;       // title → _id
  lastRefreshed: Date | null;
}

const cache: RefCache = {
  authors: new Map(),
  categories: new Map(),
  tags: new Map(),
  lastRefreshed: null,
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isCacheStale(): boolean {
  if (!cache.lastRefreshed) return true;
  return Date.now() - cache.lastRefreshed.getTime() > CACHE_TTL_MS;
}

async function refreshCache(): Promise<void> {
  try {
    const authors = await query<Array<{ _id: string; name: string }>>(
      `*[_type == "author"]{ _id, name }`,
    );
    cache.authors.clear();
    for (const a of authors ?? []) {
      if (a.name) cache.authors.set(a.name, a._id);
    }

    const categories = await query<Array<{ _id: string; title: string }>>(
      `*[_type == "category"]{ _id, title }`,
    );
    cache.categories.clear();
    for (const c of categories ?? []) {
      if (c.title) cache.categories.set(c.title, c._id);
    }

    const tags = await query<Array<{ _id: string; title: string }>>(
      `*[_type == "tag"]{ _id, title }`,
    );
    cache.tags.clear();
    for (const t of tags ?? []) {
      if (t.title) cache.tags.set(t.title, t._id);
    }

    cache.lastRefreshed = new Date();
  } catch (err) {
    console.warn("Failed to refresh Sanity reference cache:", (err as Error).message);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve author name → Sanity _id. Returns null if not found.
 */
export async function resolveAuthorRef(name: string): Promise<string | null> {
  if (isCacheStale()) await refreshCache();

  if (cache.authors.has(name)) return cache.authors.get(name)!;

  // Cache miss — query directly
  const result = await query<Array<{ _id: string }>>(
    `*[_type == "author" && name == $name][0]{ _id }`,
    { name },
  );

  if (result && !Array.isArray(result) && (result as { _id?: string })._id) {
    const id = (result as { _id: string })._id;
    cache.authors.set(name, id);
    return id;
  }

  return null;
}

/**
 * Resolve CF category → Sanity category _id.
 * Maps CF category name to Sanity category title via CATEGORY_MAP.
 */
export async function resolveCategoryRef(cfCategory: string): Promise<string | null> {
  const sanityTitle = CATEGORY_MAP[cfCategory];
  if (!sanityTitle) return null;

  if (isCacheStale()) await refreshCache();

  if (cache.categories.has(sanityTitle)) return cache.categories.get(sanityTitle)!;

  // Cache miss — query
  const result = await query<{ _id?: string }>(
    `*[_type == "category" && title == $title][0]{ _id }`,
    { title: sanityTitle },
  );

  if (result?._id) {
    cache.categories.set(sanityTitle, result._id);
    return result._id;
  }

  return null;
}

/**
 * Resolve tag titles → Sanity _ids. Auto-creates missing tags.
 */
export async function resolveTagRefs(tags: string[]): Promise<string[]> {
  if (isCacheStale()) await refreshCache();

  const refs: string[] = [];

  for (const tag of tags) {
    if (cache.tags.has(tag)) {
      refs.push(cache.tags.get(tag)!);
      continue;
    }

    // Query for existing tag
    const result = await query<{ _id?: string }>(
      `*[_type == "tag" && title == $title][0]{ _id }`,
      { title: tag },
    );

    if (result?._id) {
      cache.tags.set(tag, result._id);
      refs.push(result._id);
      continue;
    }

    // Auto-create tag
    const slug = slugifyHebrew(tag);
    const newTag = {
      _type: "tag",
      _id: `tag-${slug}`,
      title: tag,
      slug: { _type: "slug", current: slug },
    };

    try {
      const created = await createIfNotExists(newTag);
      cache.tags.set(tag, created._id);
      refs.push(created._id);
    } catch (err) {
      console.warn(`Failed to create tag "${tag}":`, (err as Error).message);
    }
  }

  return refs;
}
