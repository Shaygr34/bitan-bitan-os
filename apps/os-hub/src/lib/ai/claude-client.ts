/**
 * Anthropic Claude API client wrapper.
 *
 * Uses native fetch (no SDK dependency) with token counting, cost calculation,
 * timeout, and retry on 429 (exponential backoff, max 3 attempts).
 *
 * Two modes:
 *  - complete()       — non-streaming, for short/fast calls (< 75s)
 *  - streamComplete() — SSE streaming, for long generations (drafts, 4K tokens)
 */

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  durationMs: number;
}

// Claude Sonnet 4.6 pricing (as of 2026-03)
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-sonnet-4-5-20250929": { inputPer1M: 3.0, outputPer1M: 15.0 }, // legacy
};

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 3;
const TIMEOUT_MS = 75_000; // 75s — leaves 25s margin within 100s maxDuration

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const pricing = PRICING[model] ?? Object.values(PRICING)[0];
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function complete(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const model = params.model ?? DEFAULT_MODEL;
  const maxTokens = params.maxTokens ?? 4096;
  const temperature = params.temperature ?? 0.3;

  const requestBody = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userPrompt }],
  };

  console.log(
    `[Claude] Calling ${model} — maxTokens=${maxTokens}, temp=${temperature}, ` +
      `systemPrompt=${params.systemPrompt.length} chars, userPrompt=${params.userPrompt.length} chars`,
  );

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      console.log(`[Claude] Attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "0");
        const backoff = Math.max(retryAfter * 1000, Math.pow(2, attempt + 1) * 1000);
        console.warn(`[Claude] Rate limited (attempt ${attempt + 1}), retrying in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[Claude] API error ${response.status}:`, body.slice(0, 500));
        throw new Error(`Claude API error ${response.status}: ${body}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
      };

      const text = data.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => c.text)
        .join("");

      const inputTokens = data.usage.input_tokens;
      const outputTokens = data.usage.output_tokens;
      const durationMs = Date.now() - startTime;

      console.log(
        `[Claude] Success — model=${data.model}, input=${inputTokens}, output=${outputTokens}, ` +
          `cost=$${calculateCost(inputTokens, outputTokens, data.model).toFixed(4)}, ` +
          `duration=${durationMs}ms`,
      );

      return {
        text,
        inputTokens,
        outputTokens,
        costUsd: calculateCost(inputTokens, outputTokens, data.model),
        model: data.model,
        durationMs,
      };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err as Error;

      if ((err as Error).name === "AbortError") {
        console.error(`[Claude] Timeout after ${TIMEOUT_MS}ms (attempt ${attempt + 1})`);
        throw new Error(`Claude API timeout after ${TIMEOUT_MS / 1000}s`);
      }

      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[Claude] Error (attempt ${attempt + 1}), retrying in ${backoff}ms:`, (err as Error).message);
        await sleep(backoff);
      }
    }
  }

  throw lastError ?? new Error("Claude API call failed after retries");
}

/**
 * Streaming Claude API call — tokens arrive incrementally via SSE.
 * Use for long generations (e.g. 4K-token Hebrew articles) where
 * non-streaming would timeout waiting for the full response.
 *
 * Returns a full ClaudeResponse after the stream completes.
 */
export async function streamComplete(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const model = params.model ?? DEFAULT_MODEL;
  const maxTokens = params.maxTokens ?? 4096;
  const temperature = params.temperature ?? 0.3;

  console.log(
    `[Claude] Streaming ${model} — maxTokens=${maxTokens}, temp=${temperature}, ` +
      `systemPrompt=${params.systemPrompt.length} chars, userPrompt=${params.userPrompt.length} chars`,
  );

  const controller = new AbortController();
  // 3 minutes — generous because tokens arrive incrementally
  const timeoutId = setTimeout(() => controller.abort(), 180_000);
  const startTime = Date.now();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    // Parse SSE stream
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let responseModel = model;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);

          if (event.type === "message_start" && event.message) {
            responseModel = event.message.model ?? model;
            inputTokens = event.message.usage?.input_tokens ?? 0;
          }

          if (event.type === "content_block_delta" && event.delta?.text) {
            fullText += event.delta.text;
          }

          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? outputTokens;
            console.log(`[Claude] Streaming: ${outputTokens} tokens so far`);
          }
        } catch {
          // Skip unparseable lines (event: type lines, empty lines)
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const costUsd = calculateCost(inputTokens, outputTokens, responseModel);

    console.log(
      `[Claude] Stream complete — model=${responseModel}, input=${inputTokens}, output=${outputTokens}, ` +
        `cost=$${costUsd.toFixed(4)}, duration=${durationMs}ms, chars=${fullText.length}`,
    );

    return {
      text: fullText,
      inputTokens,
      outputTokens,
      costUsd,
      model: responseModel,
      durationMs,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Claude streaming timeout after 180s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
