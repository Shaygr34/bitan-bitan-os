import { NextResponse } from "next/server";
import { SUMIT_SYNC_API_URL } from "../../../proxy";

/** POST /api/sumit-sync/runs/[id]/execute → Python POST /runs/{id}/execute */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const url = `${SUMIT_SYNC_API_URL}/runs/${id}/execute`;
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Sumit Sync service unreachable" },
      { status: 502 }
    );
  }
}
