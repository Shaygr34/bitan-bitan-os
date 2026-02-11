/**
 * Shared request validation helpers for Content Factory API routes.
 */

import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function errorJson(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Parse JSON body, returning null + error response if parsing fails.
 */
export async function parseBody<T>(
  request: Request,
): Promise<[T, null] | [null, NextResponse]> {
  try {
    const body = await request.json() as T;
    return [body, null];
  } catch {
    return [null, errorJson(400, "INVALID_JSON", "Request body must be valid JSON")];
  }
}

/**
 * Require a non-empty string field on a body object.
 */
export function requireString(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const val = body[field];
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  return null;
}

/**
 * Require a positive integer field on a body object.
 */
export function requirePositiveInt(
  body: Record<string, unknown>,
  field: string,
): number | null {
  const val = body[field];
  if (typeof val === "number" && Number.isInteger(val) && val > 0) return val;
  return null;
}

/**
 * Basic URL format validation (http/https only).
 */
export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
