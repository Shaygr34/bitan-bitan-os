/**
 * POST /api/completion/generate-link — Generate an update-mode intake link for an existing client.
 *
 * Receives: { summitEntityId, clientName }
 * Creates a Sanity intakeToken with mode: 'update' and returns the intake URL.
 *
 * TODO: Fetch client's current data from Summit to pre-fill the form.
 */

import { NextRequest, NextResponse } from "next/server";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateLinkBody {
  summitEntityId?: string;
  clientName?: string;
}

/** Generate a short 8-char alphanumeric token. */
function generateShortToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) result += chars[b % chars.length];
  return result;
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
    return NextResponse.json(
      { error: "Sanity credentials not configured" },
      { status: 500 },
    );
  }

  const token = generateShortToken();

  // Build prefill data — in the future, fetch from Summit API
  // TODO: summitRequest('/crm/data/getentity/', { EntityID: summitEntityId, Folder: "557688522" })
  //   then map fields to prefillData
  const prefillData: Record<string, string> = {};
  if (clientName) prefillData.clientName = clientName;

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
    return NextResponse.json(
      { error: "Failed to create completion link in Sanity" },
      { status: 500 },
    );
  }

  const intakeUrl = `https://bitancpa.com/intake/${token}`;
  return NextResponse.json({ url: intakeUrl, token });
}
