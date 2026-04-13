/**
 * POST /api/completion/generate-link — Generate an update-mode intake link for an existing client.
 *
 * Receives: { summitEntityId, clientName }
 * 1. Fetches client's current data from Summit API
 * 2. Creates a Sanity intakeToken with mode: 'update' + prefilled data
 * 3. Returns the intake URL
 */

import { NextRequest, NextResponse } from "next/server";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateLinkBody {
  summitEntityId?: string;
  clientName?: string;
}

function generateShortToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
}

async function fetchSummitClient(entityId: string): Promise<Record<string, string> | null> {
  const apiKey = (process.env.SUMMIT_API_KEY || "").trim();
  const companyId = process.env.SUMMIT_COMPANY_ID || "557813963";

  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.sumit.co.il/crm/data/getentity/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Credentials: { CompanyID: Number(companyId), APIKey: apiKey },
        EntityID: Number(entityId),
        Folder: "557688522",
      }),
    });

    if (!res.ok) return null;
    const json = await res.json(); // eslint-disable-line
    const entity = json?.Data?.Entity || json?.Entity;
    if (!entity) return null;

    // Map Summit fields to intake form field names
    const getValue = (field: string): string => {
      const val = entity[field];
      if (Array.isArray(val) && val.length > 0) return String(val[0]);
      if (typeof val === "string") return val;
      return "";
    };

    return {
      fullName: getValue("Customers_FullName"),
      companyNumber: getValue("Customers_CompanyNumber"),
      phone: getValue("Customers_Phone"),
      email: getValue("Customers_EmailAddress"),
      address: getValue("Customers_Address"),
      city: getValue("Customers_City"),
      zipCode: getValue("Customers_ZipCode"),
      birthdate: getValue("Customers_Birthdate"),
    };
  } catch (err) {
    console.error("Failed to fetch Summit client:", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: GenerateLinkBody = {};
  try {
    body = (await request.json()) as GenerateLinkBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const summitEntityId = typeof body.summitEntityId === "string" ? body.summitEntityId.trim() : null;
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : null;

  if (!summitEntityId) {
    return NextResponse.json({ error: "summitEntityId is required" }, { status: 400 });
  }

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || "production";
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken;

  if (!projectId || !apiToken) {
    return NextResponse.json({ error: "Sanity credentials not configured" }, { status: 500 });
  }

  // Fetch existing client data from Summit for pre-fill
  const summitData = await fetchSummitClient(summitEntityId);

  const token = generateShortToken();

  // Build prefill data from Summit
  const prefillData: Record<string, string> = {};
  if (clientName) prefillData.clientName = clientName;
  if (summitData) {
    for (const [key, val] of Object.entries(summitData)) {
      if (val) prefillData[key] = val;
    }
  }

  const doc: Record<string, unknown> = {
    _id: `intakeToken-${token}`,
    _type: "intakeToken",
    token,
    status: "pending",
    mode: "update",
    createdBy: "os-hub-completion",
    summitEntityId,
  };
  if (clientName) doc.clientName = clientName;
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
    return NextResponse.json({ error: "Failed to create completion link in Sanity" }, { status: 500 });
  }

  const intakeUrl = `https://bitancpa.com/intake/${token}`;
  return NextResponse.json({
    url: intakeUrl,
    token,
    prefilled: summitData ? Object.keys(summitData).filter((k) => summitData[k]).length : 0,
  });
}
