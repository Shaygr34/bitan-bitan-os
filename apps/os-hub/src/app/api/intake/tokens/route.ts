/**
 * GET /api/intake/tokens — List recent intake tokens from Sanity.
 */

import { NextResponse } from "next/server";
import { sanityConfig } from "@/config/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IntakeToken {
  token: string;
  status: string;
  clientName?: string;
  _createdAt: string;
  summitEntityId?: string;
}

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || "production";
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || sanityConfig.apiToken;

  if (!projectId) {
    return NextResponse.json(
      { error: "Sanity not configured" },
      { status: 500 },
    );
  }

  const groq = `*[_type == "intakeToken"] | order(_createdAt desc) [0...20] { token, status, clientName, _createdAt, summitEntityId }`;

  const searchParams = new URLSearchParams({ query: groq });
  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/query/${dataset}?${searchParams}`;

  const headers: Record<string, string> = {};
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Sanity query failed:", response.status, body);
    return NextResponse.json(
      { error: "Failed to load tokens from Sanity" },
      { status: 500 },
    );
  }

  const data = (await response.json()) as { result: IntakeToken[] };
  return NextResponse.json(data.result ?? []);
}
