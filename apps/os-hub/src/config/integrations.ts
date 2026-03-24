/* ═══════════════════════════════════════════════════
   External integration URLs — single source of truth.

   Runtime-editable via Settings page (DB-backed).
   Fallback chain: DB setting → env var → hardcoded default.

   For server-side code, prefer `getIntegrationSettings()` from
   `@/lib/settings` which reads from DB. These exports are static
   fallbacks used when DB is unavailable or for build-time references.
   ═══════════════════════════════════════════════════ */

export interface IntegrationLink {
  label: string;          // Hebrew display label
  url: string;
  description?: string;   // short helper text (Hebrew)
}

/** Static fallbacks — used at build time or when DB is unavailable. */
export const bitanWebsite = {
  site: {
    label: "אתר",
    url:
      process.env.NEXT_PUBLIC_BITAN_WEBSITE_URL ??
      "https://bitancpa.com",
    description: "אתר ביטן את ביטן",
  } satisfies IntegrationLink,

  studio: {
    label: "עריכת תוכן (Sanity Studio)",
    url:
      process.env.NEXT_PUBLIC_BITAN_STUDIO_URL ??
      "https://bitancpa.com/studio",
    description: "ממשק ניהול תוכן — Sanity Studio",
  } satisfies IntegrationLink,

  ga4: {
    label: "Analytics (GA4)",
    url:
      process.env.NEXT_PUBLIC_BITAN_GA4_URL ??
      "https://analytics.google.com/analytics/web/#/a385303851p525595931/realtime/overview",
    description: "Google Analytics 4 — תצוגה בזמן אמת",
  } satisfies IntegrationLink,
};

/** Resource links for the founder console. */
export const bitanWebsiteResources = {
  railway: {
    label: "Railway",
    url:
      process.env.NEXT_PUBLIC_BITAN_RAILWAY_URL ??
      "https://railway.com/project/19251990-b470-415b-9cae-d436be72240b",
    description: "ניהול שרת ודיפלוי — Railway",
  } satisfies IntegrationLink,

  github: {
    label: "GitHub",
    url:
      process.env.NEXT_PUBLIC_BITAN_GITHUB_URL ??
      "https://github.com/Shaygr34/bitan-bitan-website",
    description: "קוד מקור האתר — GitHub",
  } satisfies IntegrationLink,
};

/** Base URL used for server-side health checks (no trailing slash). */
export const bitanWebsiteHealthUrl =
  process.env.BITAN_WEBSITE_HEALTH_URL ??
  "https://bitancpa.com";

/* ═══════════════════════════════════════════════════
   AI — Anthropic Claude
   ═══════════════════════════════════════════════════ */

export const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";

/* ═══════════════════════════════════════════════════
   Sanity CMS — Write client
   ═══════════════════════════════════════════════════ */

export const sanityConfig = {
  projectId: process.env.SANITY_PROJECT_ID ?? "",
  dataset: process.env.SANITY_DATASET ?? "production",
  apiToken: process.env.SANITY_API_TOKEN ?? "",
};

/* ═══════════════════════════════════════════════════
   Cron — Ingestion auth
   ═══════════════════════════════════════════════════ */

export const cronSecret = process.env.CRON_SECRET ?? "";
