import { NextRequest, NextResponse } from "next/server";
import { proxyPatch } from "../../../../proxy";

/** PATCH /api/sumit-sync/runs/[id]/exceptions/[exId] → Python PATCH */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; exId: string } }
) {
  const { id, exId } = params;
  try {
    const body = await request.json();
    const res = await proxyPatch(`/runs/${id}/exceptions/${exId}`, body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Sumit Sync service unreachable", detail: String(err) },
      { status: 502 }
    );
  }
}
