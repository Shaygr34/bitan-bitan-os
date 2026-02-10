import { NextResponse } from "next/server";
import { proxyGet } from "../../proxy";

/** GET /api/sumit-sync/runs/[id] → Python GET /runs/{id} */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const res = await proxyGet(`/runs/${id}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Sumit Sync service unreachable" },
      { status: 502 }
    );
  }
}
