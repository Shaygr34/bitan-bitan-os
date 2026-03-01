/**
 * Sanity write client (native fetch, no SDK dependency).
 *
 * Uses the Sanity HTTP API for mutations (createOrReplace).
 */

import { sanityConfig } from "@/config/integrations";

export interface SanityMutationResult {
  transactionId: string;
  results: Array<{
    id: string;
    document: Record<string, unknown>;
  }>;
}

/**
 * Create or replace a document in Sanity.
 */
export async function createOrReplace(
  doc: Record<string, unknown>,
): Promise<{ _id: string }> {
  const { projectId, dataset, apiToken } = sanityConfig;

  if (!projectId || !apiToken) {
    throw new Error("Sanity credentials not configured (SANITY_PROJECT_ID, SANITY_API_TOKEN)");
  }

  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      mutations: [{ createOrReplace: doc }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Sanity mutation failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as SanityMutationResult;
  return { _id: result.results?.[0]?.id ?? (doc._id as string) };
}

/**
 * Query Sanity using GROQ.
 */
export async function query<T = unknown>(
  groq: string,
  params: Record<string, string> = {},
): Promise<T> {
  const { projectId, dataset, apiToken } = sanityConfig;

  if (!projectId) {
    throw new Error("Sanity not configured (SANITY_PROJECT_ID)");
  }

  const searchParams = new URLSearchParams({ query: groq });
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(`$${key}`, JSON.stringify(value));
  }

  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/query/${dataset}?${searchParams}`;

  const headers: Record<string, string> = {};
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Sanity query failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { result: T };
  return data.result;
}

/**
 * Create a document if it doesn't exist.
 */
export async function createIfNotExists(
  doc: Record<string, unknown>,
): Promise<{ _id: string }> {
  const { projectId, dataset, apiToken } = sanityConfig;

  if (!projectId || !apiToken) {
    throw new Error("Sanity credentials not configured");
  }

  const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      mutations: [{ createIfNotExists: doc }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Sanity createIfNotExists failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as SanityMutationResult;
  return { _id: result.results?.[0]?.id ?? (doc._id as string) };
}
