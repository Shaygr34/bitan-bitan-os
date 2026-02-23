import { NextResponse } from "next/server";
import { bitanWebsiteHealthUrl } from "@/config/integrations";

/**
 * Server-side proxy for website availability check.
 * Avoids CORS issues by running the check from the backend.
 * Returns { status: "up" | "down", responseMs, checkedUrl }.
 */
export async function GET() {
  const url = bitanWebsiteHealthUrl;
  const t0 = performance.now();

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
    });

    const responseMs = Math.round(performance.now() - t0);

    if (res.ok) {
      return NextResponse.json({ status: "up", responseMs, checkedUrl: url });
    }

    return NextResponse.json({
      status: "down",
      responseMs,
      httpStatus: res.status,
      checkedUrl: url,
    });
  } catch {
    const responseMs = Math.round(performance.now() - t0);
    return NextResponse.json({
      status: "down",
      responseMs,
      checkedUrl: url,
    });
  }
}
