/**
 * GET /api/completion/summary — Returns client completion data from Summit CRM.
 *
 * Fetches all clients from Summit (folder 557688522), checks document + data fields,
 * computes completion % per client. Results cached in-memory for 1 hour.
 *
 * Query params:
 *   ?refresh=true — force refetch from Summit (takes ~10 minutes with rate limiting)
 *   ?scan=start  — trigger background scan (returns immediately, populates cache async)
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClientCompletion {
  entityId: string;
  name: string;
  clientType: string;
  manager: string;
  completionPercent: number;
  docs: Record<string, boolean>;
  fields: Record<string, boolean>;
}

// Summit field name → our key mapping
const DOC_FIELDS_MAP: Record<string, string> = {
  "ת.ז/ רישיון בעלים": "idCard",
  "אישור ניהול חשבון": "bankApproval",
  "תעודת עוסק מורשה": "osekMurshe",
  "תעודת התאגדות": "teudatHitagdut",
  "תקנון חברה": "takanonCompany",
  "פרוטוקול מורשה חתימה": "protokolSignature",
  "נסח חברה": "nesachCompany",
  "פתיחת תיק רשויות / ייפוי כח": "ptichaTikRashuyot",
};

const NON_DOC_FIELDS_MAP: Record<string, string> = {
  Customers_Birthdate: "birthdate",
  Customers_Address: "address",
  Customers_City: "city",
  "פרטי בעלי מניות": "shareholderDetails",
};

// Entity refs come as objects with .Name — extract directly

// ─── Summit API helpers ─── //

async function summitRequest(endpoint: string, body: object) {
  const res = await fetch(`https://api.sumit.co.il${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Credentials: {
        CompanyID: Number(process.env.SUMMIT_COMPANY_ID || "557813963"),
        APIKey: (process.env.SUMMIT_API_KEY || "").trim(),
      },
      ...body,
    }),
    cache: "no-store", // Disable Next.js fetch cache — avoids EACCES on Docker
  });
  return res;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function resolveEntityRef(value: unknown): string {
  // Entity references come as arrays of { ID, Name, ... } objects
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "object" && first !== null) {
      return String((first as Record<string, unknown>).Name || "");
    }
    return String(first);
  }
  if (typeof value === "string") return value;
  return "";
}

// ─── Real Summit fetch ─── //

async function fetchCompletionData(): Promise<ClientCompletion[]> {
  // Step 1: Get all entity IDs (Summit caps at 10 per page — must paginate)
  const entities: { ID: number }[] = [];
  let startIndex = 0;
  let hasMore = true;

  while (hasMore) {
    const listRes = await summitRequest("/crm/data/listentities/", {
      Folder: "557688522",
      PageSize: 100, // Summit ignores this, returns 10, but we ask anyway
      StartIndex: startIndex,
    });

    if (!listRes.ok) {
      console.error("Summit listentities failed at page", startIndex, ":", listRes.status);
      break;
    }

    const listJson = await listRes.json(); // eslint-disable-line
    if (listJson?.Status !== 0) {
      console.error("Summit listentities error:", listJson?.UserErrorMessage);
      break;
    }

    const page = listJson?.Data?.Entities || [];
    entities.push(...page);
    hasMore = listJson?.Data?.HasNextPage === true;
    startIndex += page.length;

    // Brief pause between list pages
    if (hasMore) await delay(300);
  }

  console.log(`[completion] Fetched ${entities.length} entity IDs in ${Math.ceil(startIndex / 10)} pages`);

  // Initialize progress
  scanProgress = {
    current: 0,
    total: entities.length,
    parsed: 0,
    startedAt: new Date().toISOString(),
    estimatedSecondsLeft: Math.round(entities.length * 0.6),
  };
  const scanStartTime = Date.now();

  // Step 2: Fetch each entity with rate limiting
  const clients: ClientCompletion[] = [];
  let consecutiveErrors = 0;

  for (let i = 0; i < entities.length; i++) {
    const entityId = entities[i].ID;

    // Rate limiting: 500ms between calls
    if (i > 0) await delay(500);

    // Batch pause: every 50 calls, pause 10s
    if (i > 0 && i % 50 === 0) {
      console.log(`[completion] Batch pause at ${i}/${entities.length}`);
      await delay(10_000);
    }

    try {
      const entityRes = await summitRequest("/crm/data/getentity/", {
        EntityID: entityId,
        Folder: "557688522",
      });

      if (entityRes.status === 403) {
        console.warn(`[completion] Rate limited at entity ${i}, waiting 65s`);
        await delay(65_000);
        // Retry once
        const retry = await summitRequest("/crm/data/getentity/", {
          EntityID: entityId,
          Folder: "557688522",
        });
        if (!retry.ok) {
          consecutiveErrors++;
          if (consecutiveErrors > 5) {
            console.error(`[completion] Too many errors, stopping at ${i}`);
            break;
          }
          continue;
        }
        const retryJson = await retry.json(); // eslint-disable-line
        const retryEntity = retryJson?.Data?.Entity || retryJson?.Entity;
        if (retryEntity) {
          clients.push(parseEntity(retryEntity));
          consecutiveErrors = 0;
        }
        continue;
      }

      if (!entityRes.ok) {
        // Empty/archived entity — skip
        consecutiveErrors++;
        if (consecutiveErrors > 10) break;
        continue;
      }

      const entityJson = await entityRes.json(); // eslint-disable-line
      const entity = entityJson?.Data?.Entity || entityJson?.Entity;

      if (!entity) {
        // Archived or deleted
        continue;
      }

      clients.push(parseEntity(entity));
      consecutiveErrors = 0;
    } catch (err) {
      console.error(`[completion] Error fetching entity ${entityId}:`, err);
      consecutiveErrors++;
      if (consecutiveErrors > 10) break;
    }

    // Update progress
    scanProgress.current = i + 1;
    scanProgress.parsed = clients.length;
    const elapsed = (Date.now() - scanStartTime) / 1000;
    const rate = (i + 1) / elapsed;
    scanProgress.estimatedSecondsLeft = rate > 0 ? Math.round((entities.length - i - 1) / rate) : null;
  }

  console.log(`[completion] Parsed ${clients.length} clients`);

  // Sort by lowest completion first
  clients.sort((a, b) => a.completionPercent - b.completionPercent);

  return clients;
}

function parseEntity(entity: Record<string, unknown>): ClientCompletion {
  const entityId = String(entity.ID || "");
  const name = String(
    (Array.isArray(entity.Customers_FullName)
      ? entity.Customers_FullName[0]
      : entity.Customers_FullName) || "ללא שם"
  );

  // Entity refs have .Name directly
  const clientType = resolveEntityRef(entity["סוג לקוח"]);
  const manager = resolveEntityRef(entity["מנהל תיק"]);

  // Check document fields
  const docs: Record<string, boolean> = {};
  for (const [summitKey, ourKey] of Object.entries(DOC_FIELDS_MAP)) {
    docs[ourKey] = isFieldFilled(entity[summitKey]);
  }

  // Check non-doc fields
  const fields: Record<string, boolean> = {};
  for (const [summitKey, ourKey] of Object.entries(NON_DOC_FIELDS_MAP)) {
    fields[ourKey] = isFieldFilled(entity[summitKey]);
  }

  // Compute completion %
  const allKeys = [...Object.values(docs), ...Object.values(fields)];
  const filled = allKeys.filter(Boolean).length;
  const completionPercent = allKeys.length > 0 ? Math.round((filled / allKeys.length) * 100) : 0;

  return { entityId, name, clientType, manager, completionPercent, docs, fields };
}

// ─── Cache ─── //

let cachedData: { clients: ClientCompletion[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let scanInProgress = false;

// Scan progress tracking
let scanProgress = {
  current: 0,
  total: 0,
  parsed: 0,
  startedAt: null as string | null,
  estimatedSecondsLeft: null as number | null,
};

function buildResponse(clients: ClientCompletion[], cached: boolean) {
  return {
    total: clients.length,
    avgCompletion:
      clients.length > 0
        ? Math.round(clients.reduce((s, c) => s + c.completionPercent, 0) / clients.length)
        : 0,
    zeroDocsCount: clients.filter((c) => Object.values(c.docs).every((v) => !v)).length,
    allDocsCount: clients.filter((c) => Object.values(c.docs).every(Boolean)).length,
    clients,
    cached,
    scanInProgress,
    scanProgress: scanInProgress ? scanProgress : null,
    lastUpdated: cachedData?.timestamp ? new Date(cachedData.timestamp).toISOString() : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "true";
  const scan = url.searchParams.get("scan");

  // Background scan: trigger fetch and return immediately
  if (scan === "start") {
    if (scanInProgress) {
      return NextResponse.json({ message: "Scan already in progress", scanInProgress: true, scanProgress });
    }
    scanInProgress = true;

    // Fire and forget — don't await
    fetchCompletionData()
      .then((clients) => {
        cachedData = { clients, timestamp: Date.now() };
        console.log(`[completion] Scan complete: ${clients.length} clients cached`);
      })
      .catch((err) => {
        console.error("[completion] Scan failed:", err);
      })
      .finally(() => {
        scanInProgress = false;
      });

    return NextResponse.json({
      message: "Scan started. Poll GET /api/completion/summary to check results.",
      scanInProgress: true,
    });
  }

  // Serve from cache if available and fresh
  if (!refresh && cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json(buildResponse(cachedData.clients, true));
  }

  // No cache available — return empty data immediately.
  // User must click "סרוק מסאמיט" to trigger background scan.
  // NEVER do synchronous fetch — it takes 10+ minutes and times out.
  return NextResponse.json({
    total: 0,
    avgCompletion: 0,
    zeroDocsCount: 0,
    allDocsCount: 0,
    clients: [],
    cached: false,
    scanInProgress,
    scanProgress: scanInProgress ? scanProgress : null,
    lastUpdated: null,
    needsScan: true,
  });
}
