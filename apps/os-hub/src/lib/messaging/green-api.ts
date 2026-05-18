/**
 * Green API WhatsApp transport — SHARED across branches.
 *
 * This module is deliberately channel-/feature-agnostic and lives OUTSIDE
 * `cpaa/` and `onboarding/`: the CPAA client-message flow AND onboarding
 * Stage-5 sends use this one client. Do NOT re-implement a second Green API
 * client in either branch (cross-branch seam — see CPAA continuity memory).
 *
 * Honest boundary (open input #7): a real send needs a paid Business-instance
 * `idInstance` + `apiTokenInstance`. Without them `getTransport()` returns the
 * DryRunTransport — it records the message and returns a `dryrun-*` id but
 * NEVER pretends a real WhatsApp message was delivered. No fabrication.
 */

export interface GreenApiConfig {
  idInstance: string;
  apiTokenInstance: string;
  /** Defaults to the public Green API host. */
  apiUrl: string;
}

export interface SendResult {
  idMessage: string;
  /** true ⇒ nothing left the building; this was a preview. */
  dryRun: boolean;
}

export interface MessageTransport {
  send(chatId: string, message: string): Promise<SendResult>;
}

export class GreenApiRateLimitError extends Error {
  constructor(message = "Green API rate limited (HTTP 429)") {
    super(message);
    this.name = "GreenApiRateLimitError";
  }
}

/**
 * Israeli phone → Green API chatId (`9725XXXXXXXX@c.us`).
 * Returns null for anything that isn't a plausible IL mobile — the caller
 * must surface "no valid number", never guess a recipient.
 */
export function chatIdFromIsraeliPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  // Israeli mobile national number is 9 digits, leading 5 (e.g. 5X-XXXXXXX).
  if (d.length !== 9 || !d.startsWith("5")) return null;
  return `972${d}@c.us`;
}

/** Read creds from env. Null when not configured (→ dry-run). */
export function loadGreenApiConfigFromEnv(): GreenApiConfig | null {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim();
  const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE?.trim();
  if (!idInstance || !apiTokenInstance) return null;
  return {
    idInstance,
    apiTokenInstance,
    apiUrl: process.env.GREEN_API_URL?.trim() || "https://api.green-api.com",
  };
}

/** Records messages, sends nothing. Used for preview + tests. */
export class DryRunTransport implements MessageTransport {
  readonly sent: { chatId: string; message: string }[] = [];
  private seq = 0;

  async send(chatId: string, message: string): Promise<SendResult> {
    this.sent.push({ chatId, message });
    this.seq += 1;
    return { idMessage: `dryrun-${this.seq}`, dryRun: true };
  }
}

/** Real Green API transport. Only constructed when creds exist. */
export class LiveGreenApiTransport implements MessageTransport {
  constructor(private readonly cfg: GreenApiConfig) {}

  async send(chatId: string, message: string): Promise<SendResult> {
    const { apiUrl, idInstance, apiTokenInstance } = this.cfg;
    const url = `${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (res.status === 429) throw new GreenApiRateLimitError();
    if (!res.ok) {
      throw new Error(`Green API send failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { idMessage?: string };
    if (!data.idMessage) throw new Error("Green API: no idMessage in response");
    return { idMessage: data.idMessage, dryRun: false };
  }
}

/**
 * The transport the app should use. Live iff env is configured, else a
 * DryRunTransport (preview). Callers MUST check `result.dryRun`.
 */
export function getTransport(
  config: GreenApiConfig | null = loadGreenApiConfigFromEnv(),
): MessageTransport {
  return config ? new LiveGreenApiTransport(config) : new DryRunTransport();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Paced batch sender — spaces sends and backs off on 429, mirroring the
 * Summit-client throttle. `sleepFn` is injectable for tests.
 */
export class PacedSender {
  constructor(
    private readonly transport: MessageTransport,
    private readonly opts: {
      spacingMs?: number;
      maxRetries?: number;
      backoffMs?: number;
      sleepFn?: (ms: number) => Promise<void>;
    } = {},
  ) {}

  async sendOne(chatId: string, message: string): Promise<SendResult> {
    const { maxRetries = 4, backoffMs = 45_000, sleepFn = sleep } = this.opts;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.transport.send(chatId, message);
      } catch (err) {
        const retriable =
          err instanceof GreenApiRateLimitError && attempt < maxRetries;
        if (!retriable) throw err;
        await sleepFn(backoffMs * 2 ** attempt);
      }
    }
    // Unreachable: the final attempt either returns or throws above.
    throw new GreenApiRateLimitError("Green API: retries exhausted");
  }

  async sendBatch(
    items: { chatId: string; message: string }[],
  ): Promise<{ ok: SendResult[]; failed: { chatId: string; error: string }[] }> {
    const { spacingMs = 200, sleepFn = sleep } = this.opts;
    const ok: SendResult[] = [];
    const failed: { chatId: string; error: string }[] = [];
    for (let i = 0; i < items.length; i++) {
      const { chatId, message } = items[i];
      try {
        ok.push(await this.sendOne(chatId, message));
      } catch (err) {
        failed.push({ chatId, error: err instanceof Error ? err.message : String(err) });
      }
      if (i < items.length - 1) await sleepFn(spacingMs);
    }
    return { ok, failed };
  }
}
