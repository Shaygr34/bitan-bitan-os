import { NextRequest, NextResponse } from "next/server";
import { proxyGet, BASE_URL } from "../../../../proxy";

/** GET /api/sumit-sync/runs/[id]/drill-down/[metric] → Python GET */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; metric: string } }
) {
  const { id, metric } = params;
  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const path = `/runs/${id}/drill-down/${metric}${qs ? `?${qs}` : ""}`;
    const res = await proxyGet(path);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "שירות Sumit Sync לא זמין",
        target: `${BASE_URL}/runs/${id}/drill-down/${metric}`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}
