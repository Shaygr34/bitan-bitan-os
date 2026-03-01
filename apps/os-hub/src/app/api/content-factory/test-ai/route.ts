/**
 * GET /api/content-factory/test-ai — Temporary diagnostic endpoint.
 * Verifies API key accessibility and tests a minimal Claude API call.
 * DELETE THIS FILE after debugging is complete.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log("[AI-TEST] Key exists:", !!key);
  console.log("[AI-TEST] Key prefix:", key ? key.substring(0, 10) + "..." : "(none)");

  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set", keyExists: false },
      { status: 500 },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 50,
        messages: [
          { role: "user", content: 'Say "hello" in Hebrew. One word only.' },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();
    console.log("[AI-TEST] Response status:", response.status);
    console.log(
      "[AI-TEST] Response:",
      JSON.stringify(data).substring(0, 500),
    );

    return NextResponse.json({
      keyExists: true,
      keyPrefix: key.substring(0, 10) + "...",
      status: response.status,
      data,
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[AI-TEST] Error:", msg);
    return NextResponse.json(
      { keyExists: true, error: msg },
      { status: 500 },
    );
  }
}
