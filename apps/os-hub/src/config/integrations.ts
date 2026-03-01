/* ═══════════════════════════════════════════════════
   External integration URLs — single source of truth.
   Override via NEXT_PUBLIC_* env vars; defaults below.
   ═══════════════════════════════════════════════════ */

export interface IntegrationLink {
  label: string;          // Hebrew display label
  url: string;
  description?: string;   // short helper text (Hebrew)
}

export const bitanWebsite = {
  site: {
    label: "אתר",
    url:
      process.env.NEXT_PUBLIC_BITAN_WEBSITE_URL ??
      "https://bitan-bitan-website-production.up.railway.app/",
    description: "אתר ביטן את ביטן — סביבת Staging",
  } satisfies IntegrationLink,

  studio: {
    label: "עריכת תוכן (Sanity Studio)",
    url:
      process.env.NEXT_PUBLIC_BITAN_STUDIO_URL ??
      "https://bitan-bitan-website-production.up.railway.app/studio",
    description: "ממשק ניהול תוכן — Sanity Studio",
  } satisfies IntegrationLink,

  ga4: {
    label: "Analytics (GA4)",
    url:
      process.env.NEXT_PUBLIC_BITAN_GA4_URL ??
      "https://analytics.google.com/analytics/web/?utm_source=marketingplatform.google.com&utm_medium=et&utm_campaign=marketingplatform.google.com%2Fabout%2Fanalytics%2F#/a385303851p525595931/realtime/overview?params=_u..nav%3Dmaui",
    description: "Google Analytics 4 — תצוגה בזמן אמת",
  } satisfies IntegrationLink,
};

/** Resource links for the founder console. */
export const bitanWebsiteResources = {
  railway: {
    label: "Railway",
    url:
      process.env.NEXT_PUBLIC_BITAN_RAILWAY_URL ??
      "https://railway.com/project/19251990-b470-415b-9cae-d436be72240b/service/5a8a5ce3-c146-4919-a506-ab3a8c9ab6bf?environmentId=ed959712-aaae-4fa8-abe7-a7b788509f54",
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
  "https://bitan-bitan-website-production.up.railway.app";

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
