/**
 * GET /api/completion/summary — Returns client completion data.
 *
 * MVP: Returns mock data for 20 sample clients.
 * TODO: Wire up real Summit API fetch with rate limiting + caching.
 *
 * Real implementation plan:
 * 1. Call Summit listentities (folder 557688522, pageSize 1000)
 * 2. For each client, call getentity with 500ms delay, 50-batch with 10s pause
 * 3. Check document fields + non-doc fields for completion
 * 4. Cache result in-memory or JSON file with 1h TTL
 * 5. ?refresh=true to force refresh
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

// Document fields to check (from Summit schema)
const DOC_FIELD_KEYS = [
  "idCard",           // ת.ז/ רישיון בעלים
  "bankApproval",     // אישור ניהול חשבון
  "osekMurshe",       // תעודת עוסק מורשה
  "teudatHitagdut",   // תעודת התאגדות
  "takanonCompany",   // תקנון חברה
  "protokolSignature", // פרוטוקול מורשה חתימה
  "nesachCompany",    // נסח חברה
  "ptichaTikRashuyot", // פתיחת תיק רשויות / ייפוי כח
];

const NON_DOC_FIELD_KEYS = ["birthdate", "address", "city", "shareholderDetails"];

const CLIENT_TYPES = ["עוסק מורשה", "חברה בע\"מ", "עוסק פטור", "שותפות", "עמותה", "עסק זעיר"];
const MANAGERS = ["אבי ביטן", "רון ביטן"];

const MOCK_NAMES = [
  "ישראל ישראלי", "יוסף כהן", "אברהם לוי", "משה דוד", "שרה גולדברג",
  "רחל אבידן", "דניאל פרידמן", "יעקב בן-דוד", "נעמי שפירא", "אלי מזרחי",
  "חיים ברקוביץ", "מיכל שטרן", "אורי קליין", "דינה רוזנברג", "עמית חדד",
  "ליאת סגל", "גדעון וולף", "תמר אשכנזי", "רון מלכה", "שירה נחום",
];

function generateMockClients(): ClientCompletion[] {
  const clients: ClientCompletion[] = [];

  for (let i = 0; i < 20; i++) {
    const docs: Record<string, boolean> = {};
    const fields: Record<string, boolean> = {};

    // Randomly fill docs
    for (const key of DOC_FIELD_KEYS) {
      docs[key] = Math.random() > 0.55;
    }
    // Randomly fill fields
    for (const key of NON_DOC_FIELD_KEYS) {
      fields[key] = Math.random() > 0.4;
    }

    const totalFields = DOC_FIELD_KEYS.length + NON_DOC_FIELD_KEYS.length;
    const filledCount =
      Object.values(docs).filter(Boolean).length +
      Object.values(fields).filter(Boolean).length;
    const completionPercent = Math.round((filledCount / totalFields) * 100);

    clients.push({
      entityId: String(1000000 + i),
      name: MOCK_NAMES[i],
      clientType: CLIENT_TYPES[i % CLIENT_TYPES.length],
      manager: MANAGERS[i % MANAGERS.length],
      completionPercent,
      docs,
      fields,
    });
  }

  // Sort by lowest completion first
  clients.sort((a, b) => a.completionPercent - b.completionPercent);

  return clients;
}

// In-memory cache
let cachedData: { clients: ClientCompletion[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "true";

  if (!refresh && cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
    const clients = cachedData.clients;
    return NextResponse.json({
      total: clients.length,
      avgCompletion: Math.round(clients.reduce((s, c) => s + c.completionPercent, 0) / clients.length),
      zeroDocsCount: clients.filter((c) => Object.values(c.docs).every((v) => !v)).length,
      allDocsCount: clients.filter((c) => Object.values(c.docs).every(Boolean)).length,
      clients,
      cached: true,
    });
  }

  // TODO: Replace with real Summit API fetch
  // Real implementation would:
  // 1. summitRequest('/crm/data/listentities/', { Folder: "557688522", PageSize: 1000, StartIndex: 0 })
  // 2. For each entity, summitRequest('/crm/data/getentity/', { EntityID: id, Folder: "557688522" })
  //    with 500ms delay between calls, 10s pause every 50 calls, 65s pause on 403
  // 3. Map Summit field names to our schema:
  //    "ת.ז/ רישיון בעלים" → idCard
  //    "אישור ניהול חשבון" → bankApproval
  //    "תעודת עוסק מורשה" → osekMurshe
  //    "תעודת התאגדות" → teudatHitagdut
  //    "תקנון חברה" → takanonCompany
  //    "פרוטוקול מורשה חתימה" → protokolSignature
  //    "נסח חברה" → nesachCompany
  //    "פתיחת תיק רשויות / ייפוי כח" → ptichaTikRashuyot
  //    "Customers_Birthdate" → birthdate
  //    "Customers_Address" → address
  //    "Customers_City" → city
  //    "פרטי בעלי מניות" → shareholderDetails

  const clients = generateMockClients();

  cachedData = { clients, timestamp: Date.now() };

  return NextResponse.json({
    total: clients.length,
    avgCompletion: Math.round(clients.reduce((s, c) => s + c.completionPercent, 0) / clients.length),
    zeroDocsCount: clients.filter((c) => Object.values(c.docs).every((v) => !v)).length,
    allDocsCount: clients.filter((c) => Object.values(c.docs).every(Boolean)).length,
    clients,
    cached: false,
  });
}
