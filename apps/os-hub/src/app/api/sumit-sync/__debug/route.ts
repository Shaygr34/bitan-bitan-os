import { NextResponse } from "next/server";
import { SUMIT_SYNC_API_URL, BASE_URL } from "../proxy";

/**
 * GET /api/sumit-sync/__debug
 * Diagnostic endpoint — shows proxy config and live-checks the Python service.
 * Server-side only (no secrets leak to browser, just connectivity info).
 */
export async function GET() {
  const info: Record<string, unknown> = {
    sumit_sync_api_url_set: !!SUMIT_SYNC_API_URL,
    resolved_base_url: BASE_URL,
    timestamp: new Date().toISOString(),
  };

  // Resolve hostname
  try {
    const url = new URL(BASE_URL);
    info.hostname = url.hostname;
    info.port = url.port || "(default)";
    info.protocol = url.protocol;
  } catch (err) {
    info.hostname_error = String(err);
  }

  // Live fetch to /health
  try {
    const healthUrl = `${BASE_URL}/health`;
    const start = Date.now();
    const res = await fetch(healthUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const elapsed = Date.now() - start;
    const body = await res.text();
    info.health_check = {
      status: res.status,
      elapsed_ms: elapsed,
      body: body.slice(0, 500),
    };
  } catch (err) {
    info.health_check = {
      error: String(err),
      hint: "Sumit Sync service is not reachable from os-hub. Check SUMIT_SYNC_API_URL and that the service is running.",
    };
  }

  return NextResponse.json(info);
}
