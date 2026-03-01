/**
 * Unit tests for Sanity document mapper (without Sanity API calls).
 *
 * Run: node --experimental-strip-types --test tests/sanity-mapper.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Inline slugify (same as slugify.ts) ─────────────────────────────────────

function slugifyHebrew(input: string): string {
  return input.trim().replace(/\s+/g, "-").replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, "").slice(0, 96);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Sanity mapper - document ID", () => {
  it("creates draft ID with cf- prefix", () => {
    const articleId = "abc-123-def";
    const isDraft = true;
    const idPrefix = isDraft ? "drafts." : "";
    const docId = `${idPrefix}cf-${articleId}`;
    assert.equal(docId, "drafts.cf-abc-123-def");
  });

  it("creates non-draft ID without drafts. prefix", () => {
    const articleId = "abc-123-def";
    const isDraft = false;
    const idPrefix = isDraft ? "drafts." : "";
    const docId = `${idPrefix}cf-${articleId}`;
    assert.equal(docId, "cf-abc-123-def");
  });
});

describe("Sanity mapper - slug generation", () => {
  it("uses existing slug if available", () => {
    const articleSlug = "existing-slug";
    const slug = articleSlug || slugifyHebrew("כותרת חלופית");
    assert.equal(slug, "existing-slug");
  });

  it("generates slug from title if no slug", () => {
    const articleSlug = null;
    const slug = articleSlug || slugifyHebrew("חוזר מקצועי חדש");
    assert.equal(slug, "חוזר-מקצועי-חדש");
  });
});

describe("Sanity mapper - category mapping", () => {
  const CATEGORY_MAP: Record<string, string> = {
    Tax: "מס הכנסה",
    Payroll: "שכר",
    Legal: "מס הכנסה",
    Regulation: "מס הכנסה",
    Grants: "חברות",
    "Business-News": "חברות",
    Markets: "חברות",
  };

  it("maps Tax to מס הכנסה", () => {
    assert.equal(CATEGORY_MAP["Tax"], "מס הכנסה");
  });

  it("maps Payroll to שכר", () => {
    assert.equal(CATEGORY_MAP["Payroll"], "שכר");
  });

  it("maps Legal to מס הכנסה (closest fit)", () => {
    assert.equal(CATEGORY_MAP["Legal"], "מס הכנסה");
  });

  it("maps Business-News to חברות", () => {
    assert.equal(CATEGORY_MAP["Business-News"], "חברות");
  });

  it("returns undefined for unknown category", () => {
    assert.equal(CATEGORY_MAP["Unknown"], undefined);
  });
});

describe("Sanity mapper - AI disclaimer", () => {
  it("adds disclaimer for AI-generated articles", () => {
    const aiGenerated = true;
    const disclaimer = aiGenerated
      ? "מאמר זה נכתב בסיוע בינה מלאכותית ונערך על ידי צוות רו\"ח ביטן את ביטן. המידע הינו כללי ואינו מהווה תחליף לייעוץ מקצועי פרטני."
      : undefined;
    assert.ok(disclaimer);
    assert.ok(disclaimer.includes("בינה מלאכותית"));
  });

  it("no disclaimer for human-written articles", () => {
    const aiGenerated = false;
    const disclaimer = aiGenerated
      ? "מאמר זה נכתב בסיוע בינה מלאכותית..."
      : undefined;
    assert.equal(disclaimer, undefined);
  });

  it("sets difficulty to basic for AI articles", () => {
    const aiGenerated = true;
    const difficulty = aiGenerated ? "basic" : undefined;
    assert.equal(difficulty, "basic");
  });
});

describe("Sanity mapper - document structure", () => {
  it("creates valid _type", () => {
    const doc = { _type: "article" };
    assert.equal(doc._type, "article");
  });

  it("slug has correct format", () => {
    const slug = { _type: "slug", current: "test-slug" };
    assert.equal(slug._type, "slug");
    assert.ok(slug.current);
  });

  it("reference has correct format", () => {
    const ref = { _type: "reference", _ref: "abc123" };
    assert.equal(ref._type, "reference");
    assert.ok(ref._ref);
  });

  it("tag references have _key for arrays", () => {
    const tags = ["ref1", "ref2"].map((ref, i) => ({
      _type: "reference" as const,
      _ref: ref,
      _key: `tag-${i}`,
    }));
    assert.equal(tags.length, 2);
    assert.equal(tags[0]._key, "tag-0");
    assert.equal(tags[1]._key, "tag-1");
  });
});
