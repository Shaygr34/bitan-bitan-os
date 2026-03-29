/**
 * GET /api/intake/tokens — List recent intake tokens from Sanity.
 * DELETE /api/intake/tokens — Delete all intake tokens from Sanity.
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
  submittedData?: string;
  prefillData?: string;
}

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || "production";
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken;

  if (!projectId) {
    return NextResponse.json(
      { error: "Sanity not configured" },
      { status: 500 },
    );
  }

  const groq = `*[_type == "intakeToken"] | order(_createdAt desc) [0...20] { token, status, clientName, _createdAt, summitEntityId, submittedData, prefillData }`;

  const searchParams = new URLSearchParams({ query: groq });
  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/query/${dataset}?${searchParams}`;

  const headers: Record<string, string> = {};
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  const response = await fetch(url, { headers, cache: "no-store" });

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

export async function DELETE() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || "production";
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken;

  if (!projectId || !apiToken) {
    return NextResponse.json(
      { error: "Sanity credentials not configured" },
      { status: 500 },
    );
  }

  // First, fetch all intakeToken document IDs
  const groq = `*[_type == "intakeToken"]._id`;
  const searchParams = new URLSearchParams({ query: groq });
  const queryUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/query/${dataset}?${searchParams}`;

  const queryResponse = await fetch(queryUrl, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });

  if (!queryResponse.ok) {
    const body = await queryResponse.text().catch(() => "");
    console.error("Sanity query failed:", queryResponse.status, body);
    return NextResponse.json(
      { error: "Failed to query tokens from Sanity" },
      { status: 500 },
    );
  }

  const queryData = (await queryResponse.json()) as { result: string[] };
  const ids: string[] = queryData.result ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  // Build delete mutations for all IDs
  const mutations = ids.map((id) => ({ delete: { id } }));

  const mutateUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`;
  const mutateResponse = await fetch(mutateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ mutations }),
  });

  if (!mutateResponse.ok) {
    const body = await mutateResponse.text().catch(() => "");
    console.error("Sanity delete failed:", mutateResponse.status, body);
    return NextResponse.json(
      { error: "Failed to delete tokens from Sanity" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: ids.length });
}
