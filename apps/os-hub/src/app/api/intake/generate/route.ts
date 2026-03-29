/**
 * POST /api/intake/generate — Generate a new intake token and store in Sanity.
 */

import { NextRequest, NextResponse } from "next/server";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateBody {
  clientName?: string;
}

export async function POST(request: NextRequest) {
  let body: GenerateBody = {};
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    // empty body is fine — clientName is optional
  }

  const token = crypto.randomUUID();
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() || null : null;

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || "production";
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || sanityConfig.apiToken;

  if (!projectId || !apiToken) {
    return NextResponse.json(
      { error: "Sanity credentials not configured" },
      { status: 500 },
    );
  }

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
    const body = await response.text().catch(() => "");
    console.error("Sanity mutation failed:", response.status, body);
    return NextResponse.json(
      { error: "Failed to create intake token in Sanity" },
      { status: 500 },
    );
  }

  const intakeUrl = `https://bitancpa.com/intake/${token}`;
  return NextResponse.json({ url: intakeUrl, token });
}
