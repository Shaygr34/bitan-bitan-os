import { NextResponse } from "next/server";
import { BASE_URL } from "../../../proxy";

/** POST /api/sumit-sync/runs/[id]/execute-api → Python POST /runs/{id}/execute-api */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const url = `${BASE_URL}/runs/${id}/execute-api`;
    console.log(`[sumit-sync proxy] POST ${url}`);
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(900_000), // 15 min — API mode is slow
    });
    console.log(`[sumit-sync proxy] ${url} → ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[sumit-sync proxy] Execute-API failed for run ${id}:`, err);
    return NextResponse.json(
      {
        error: "שירות Sumit Sync לא זמין",
        target: `${BASE_URL}/runs/${id}/execute-api`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}
