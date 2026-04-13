import { NextResponse } from "next/server";
import { proxyGet } from "../../../proxy";

/** GET /api/sumit-sync/runs/mapping/summary → Python GET /runs/mapping/summary */
export async function GET() {
  try {
    const res = await proxyGet("/runs/mapping/summary");
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[sumit-sync proxy] Mapping summary failed:", err);
    return NextResponse.json(
      { error: "שירות לא זמין", detail: String(err) },
      { status: 502 }
    );
  }
}
