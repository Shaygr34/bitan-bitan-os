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
    label: "פתח אתר",
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

/** Base URL used for server-side health checks (no trailing slash). */
export const bitanWebsiteHealthUrl =
  process.env.BITAN_WEBSITE_HEALTH_URL ??
  "https://bitan-bitan-website-production.up.railway.app";
