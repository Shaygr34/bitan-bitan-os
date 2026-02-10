/**
 * Server-side helper for proxying to the Sumit Sync Python service.
 * All browser requests go through Next.js API routes — never direct.
 */

const SUMIT_SYNC_API_URL =
  process.env.SUMIT_SYNC_API_URL || "http://localhost:8000";

export async function proxyGet(path: string): Promise<Response> {
  const url = `${SUMIT_SYNC_API_URL}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  return res;
}

export async function proxyPost(
  path: string,
  body: Record<string, unknown>
): Promise<Response> {
  const url = `${SUMIT_SYNC_API_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return res;
}

export async function proxyFormData(
  path: string,
  formData: FormData
): Promise<Response> {
  const url = `${SUMIT_SYNC_API_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  return res;
}

export { SUMIT_SYNC_API_URL };
