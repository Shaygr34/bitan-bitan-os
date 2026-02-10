import { NextResponse } from "next/server";
import { proxyPost } from "../../../proxy";

/** POST /api/sumit-sync/runs/[id]/complete → Python POST */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const res = await proxyPost(`/runs/${id}/complete`, {});
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Sumit Sync service unreachable", detail: String(err) },
      { status: 502 }
    );
  }
}
