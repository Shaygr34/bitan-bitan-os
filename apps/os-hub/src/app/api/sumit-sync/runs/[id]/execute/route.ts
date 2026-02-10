import { NextResponse } from "next/server";
import { BASE_URL } from "../../../proxy";

/** POST /api/sumit-sync/runs/[id]/execute → Python POST /runs/{id}/execute */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const url = `${BASE_URL}/runs/${id}/execute`;
    console.log(`[sumit-sync proxy] POST ${url}`);
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    console.log(`[sumit-sync proxy] ${url} → ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[sumit-sync proxy] Execute failed for run ${id}:`, err);
    return NextResponse.json(
      {
        error: "שירות Sumit Sync לא זמין",
        target: `${BASE_URL}/runs/${id}/execute`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}
