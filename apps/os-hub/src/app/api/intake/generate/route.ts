/**
 * POST /api/intake/generate — Generate a new intake token and store in Sanity.
 */

import { NextRequest, NextResponse } from "next/server";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateBody {
  clientName?: string;
  clientType?: string;
  manager?: string;
}

/** Generate a short 8-char alphanumeric token (no ambiguous chars). */
function generateShortToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l, i
  let result = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
}

/** Check Summit for existing clients with a similar name. Returns list of matching names or empty array. */
async function checkSummitDuplicates(clientName: string): Promise<string[]> {
  const companyId = process.env.SUMMIT_COMPANY_ID || "557813963";
  const apiKey = process.env.SUMMIT_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.sumit.co.il/crm/data/listentities/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Credentials: { CompanyID: Number(companyId), APIKey: apiKey },
        Folder: "557688522",
        Filters: [{ Property: "Customers_FullName", Value: clientName }],
        Paging: { StartIndex: 0, PageSize: 5 },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { Data?: Array<Record<string, unknown>> }; // eslint-disable-line
    if (!Array.isArray(data.Data)) return [];
    return data.Data.map((e) => String(e.Customers_FullName || "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  let body: GenerateBody = {};
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    // empty body is fine — fields are optional
  }

  const token = generateShortToken();
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() || null : null;
  const clientType = typeof body.clientType === "string" ? body.clientType.trim() || null : null;
  const manager = typeof body.manager === "string" ? body.manager.trim() || null : null;

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || "production";
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken;

  if (!projectId || !apiToken) {
    return NextResponse.json(
      { error: "Sanity credentials not configured" },
      { status: 500 },
    );
  }

  // Duplicate client check (non-blocking — runs in parallel with token generation)
  const duplicateNames = clientName ? await checkSummitDuplicates(clientName) : [];

  // Build prefill data object
  const prefillData: Record<string, string> = {};
  if (clientName) prefillData.clientName = clientName;
  if (clientType) prefillData.clientType = clientType;
  if (manager) prefillData.manager = manager;

  const doc: Record<string, unknown> = {
    _id: `intakeToken-${token}`,
    _type: "intakeToken",
    token,
    status: "pending",
    createdBy: "os-hub",
  };
  if (clientName) {
    doc.clientName = clientName;
  }
  if (Object.keys(prefillData).length > 0) {
    doc.prefillData = JSON.stringify(prefillData);
  }

  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      mutations: [{ createOrReplace: doc }],
    }),
  });

  if (!response.ok) {
    const respBody = await response.text().catch(() => "");
    console.error("Sanity mutation failed:", response.status, respBody);
    return NextResponse.json(
      { error: "Failed to create intake token in Sanity" },
      { status: 500 },
    );
  }

  const intakeUrl = `https://bitancpa.com/intake/${token}`;

  const responsePayload: Record<string, unknown> = { url: intakeUrl, token };
  if (duplicateNames.length > 0) {
    responsePayload.warning = "לקוח עם שם דומה כבר קיים במערכת";
    responsePayload.existingClients = duplicateNames;
  }

  return NextResponse.json(responsePayload);
}
