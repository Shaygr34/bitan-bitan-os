import { NextRequest, NextResponse } from "next/server";
import { proxyFormData } from "../../../proxy";

/** POST /api/sumit-sync/runs/[id]/upload → Python POST /runs/{id}/upload */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const formData = await request.formData();
    const res = await proxyFormData(`/runs/${id}/upload`, formData);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Sumit Sync service unreachable" },
      { status: 502 }
    );
  }
}
