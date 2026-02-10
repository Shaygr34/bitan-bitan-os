/**
 * Server-side helper for proxying to the Sumit Sync Python service.
 * All browser requests go through Next.js API routes — never direct.
 *
 * SUMIT_SYNC_API_URL must be set on Railway (e.g. http://sumit-sync.railway.internal:8000).
 * Falls back to http://localhost:8000 ONLY for local dev, with a loud warning.
 */

const SUMIT_SYNC_API_URL = process.env.SUMIT_SYNC_API_URL || "";

if (!SUMIT_SYNC_API_URL) {
  console.warn(
    "[sumit-sync proxy] WARNING: SUMIT_SYNC_API_URL is not set. " +
      "Falling back to http://localhost:8000. " +
      "This WILL fail on Railway — set the env var to the private URL."
  );
}

/** Resolved base URL — localhost fallback for local dev only. */
const BASE_URL = SUMIT_SYNC_API_URL || "http://localhost:8000";

async function proxyFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  console.log(`[sumit-sync proxy] ${init?.method ?? "GET"} ${url}`);
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    console.log(`[sumit-sync proxy] ${url} → ${res.status}`);
    return res;
  } catch (err) {
    console.error(`[sumit-sync proxy] FETCH FAILED for ${url}:`, err);
    throw err;
  }
}

export async function proxyGet(path: string): Promise<Response> {
  return proxyFetch(`${BASE_URL}${path}`);
}

export async function proxyPost(
  path: string,
  body: Record<string, unknown>
): Promise<Response> {
  return proxyFetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function proxyFormData(
  path: string,
  formData: FormData
): Promise<Response> {
  return proxyFetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });
}

export { SUMIT_SYNC_API_URL, BASE_URL };
