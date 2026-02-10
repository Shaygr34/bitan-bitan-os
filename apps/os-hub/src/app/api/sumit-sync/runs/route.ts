import { NextRequest, NextResponse } from "next/server";
import { proxyGet, proxyPost, BASE_URL } from "../proxy";

/** GET /api/sumit-sync/runs → Python GET /runs */
export async function GET() {
  try {
    const res = await proxyGet("/runs");
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Sumit Sync service unreachable",
        target: `${BASE_URL}/runs`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}

/** POST /api/sumit-sync/runs → Python POST /runs */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await proxyPost("/runs", body);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Sumit Sync service unreachable",
        target: `${BASE_URL}/runs`,
        detail: String(err),
      },
      { status: 502 }
    );
  }
}
