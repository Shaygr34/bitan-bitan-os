/**
 * GET /api/content-engine/history
 *
 * Returns the list of past Content Engine conversions, newest first.
 */

import { NextResponse } from "next/server";
import { listRecords } from "@/lib/content-engine/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = listRecords();
    return NextResponse.json(records);
  } catch (err) {
    console.error("Failed to list history:", err);
    return NextResponse.json([], { status: 200 });
  }
}
