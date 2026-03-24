import { prisma } from "@/lib/prisma";

/**
 * All integration link keys and their hardcoded defaults.
 * Fallback chain: DB → env var → hardcoded default.
 */
export const INTEGRATION_DEFAULTS: Record<string, { envKey?: string; defaultValue: string; label: string }> = {
  "integration.site.url": {
    envKey: "NEXT_PUBLIC_BITAN_WEBSITE_URL",
    defaultValue: "https://bitancpa.com",
    label: "כתובת האתר",
  },
  "integration.studio.url": {
    envKey: "NEXT_PUBLIC_BITAN_STUDIO_URL",
    defaultValue: "https://bitancpa.com/studio",
    label: "Sanity Studio",
  },
  "integration.ga4.url": {
    envKey: "NEXT_PUBLIC_BITAN_GA4_URL",
    defaultValue: "https://analytics.google.com/analytics/web/#/a385303851p525595931/realtime/overview",
    label: "Google Analytics (GA4)",
  },
  "integration.railway.url": {
    envKey: "NEXT_PUBLIC_BITAN_RAILWAY_URL",
    defaultValue: "https://railway.com/project/19251990-b470-415b-9cae-d436be72240b",
    label: "Railway Dashboard",
  },
  "integration.github.url": {
    envKey: "NEXT_PUBLIC_BITAN_GITHUB_URL",
    defaultValue: "https://github.com/Shaygr34/bitan-bitan-website",
    label: "GitHub Repository",
  },
  "integration.health.url": {
    envKey: "BITAN_WEBSITE_HEALTH_URL",
    defaultValue: "https://bitancpa.com",
    label: "Health Check URL",
  },
};

/**
 * Load all integration settings from DB, with env/default fallbacks.
 * Meant for server-side use (API routes).
 */
export async function getIntegrationSettings(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  let dbSettings: Record<string, string> = {};
  try {
    const rows = await prisma.setting.findMany({ where: { group: "integrations" } });
    for (const row of rows) {
      dbSettings[row.key] = row.value;
    }
  } catch {
    // DB unavailable — fall through to defaults
  }

  for (const [key, def] of Object.entries(INTEGRATION_DEFAULTS)) {
    result[key] =
      dbSettings[key] ||
      (def.envKey ? process.env[def.envKey] ?? "" : "") ||
      def.defaultValue;
  }

  return result;
}

/**
 * Get a single setting value. Server-side only.
 */
export async function getSetting(key: string): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row?.value) return row.value;
  } catch {
    // fall through
  }
  const def = INTEGRATION_DEFAULTS[key];
  if (def) {
    return (def.envKey ? process.env[def.envKey] ?? "" : "") || def.defaultValue;
  }
  return "";
}
