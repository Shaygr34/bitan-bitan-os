import { NextRequest, NextResponse } from "next/server";
import { BASE_URL } from "../../../proxy";

/**
 * POST /api/sumit-sync/runs/[id]/write-back?mode=dry-run|live
 * → Python POST /runs/{id}/write-back/dry-run  OR  /runs/{id}/write-back
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "dry-run";
  const endpoint = mode === "live" ? "write-back" : "write-back/dry-run";

  try {
    const url = `${BASE_URL}/runs/${id}/${endpoint}`;
    console.log(`[sumit-sync proxy] POST ${url} (mode=${mode})`);
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(900_000),
    });
    console.log(`[sumit-sync proxy] ${url} → ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[sumit-sync proxy] Write-back failed for run ${id}:`, err);
    return NextResponse.json(
      { error: "שירות לא זמין", detail: String(err) },
      { status: 502 }
    );
  }
}
