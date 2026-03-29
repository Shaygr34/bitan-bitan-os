/**
 * POST /api/intake/update-internal — Update internal fields on a Summit entity.
 *
 * Body: { summitEntityId: number, folder: number, properties: Record<string, string> }
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateBody {
  summitEntityId: number;
  folder: number;
  properties: Record<string, string>;
}

export async function POST(request: NextRequest) {
  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { summitEntityId, folder, properties } = body;

  if (!summitEntityId || !folder || !properties || typeof properties !== "object") {
    return NextResponse.json(
      { error: "Missing required fields: summitEntityId, folder, properties" },
      { status: 400 },
    );
  }

  const companyId = process.env.SUMMIT_COMPANY_ID || "557813963";
  const apiKey = process.env.SUMMIT_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Summit API key not configured" },
      { status: 500 },
    );
  }

  // Build the Summit updateentity payload
  const summitPayload = {
    CompanyID: Number(companyId),
    APIKey: apiKey,
    EntityID: summitEntityId,
    Folder: folder,
    Properties: properties,
  };

  try {
    const response = await fetch("https://api.sumit.co.il/crm/data/updateentity/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summitPayload),
    });

    const data = await response.json(); // eslint-disable-line

    if (!response.ok || data.Status === false) {
      console.error("Summit updateentity failed:", data);
      return NextResponse.json(
        { error: data.UserErrorMessage || "Summit update failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Summit API error:", err);
    return NextResponse.json(
      { error: "Failed to connect to Summit API" },
      { status: 500 },
    );
  }
}
