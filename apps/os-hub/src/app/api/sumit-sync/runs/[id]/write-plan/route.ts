import { NextResponse } from "next/server";
import { BASE_URL } from "../../../proxy";

/** GET /api/sumit-sync/runs/[id]/write-plan → Python GET /runs/{id}/write-plan */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const url = `${BASE_URL}/runs/${id}/write-plan`;
    console.log(`[sumit-sync proxy] GET ${url}`);
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(900_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[sumit-sync proxy] Write plan failed for run ${id}:`, err);
    return NextResponse.json(
      { error: "שירות לא זמין", detail: String(err) },
      { status: 502 }
    );
  }
}
