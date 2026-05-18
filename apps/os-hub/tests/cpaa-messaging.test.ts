/**
 * Unit tests for the shared Green API transport + CPAA VAT message builder.
 *
 * Run: node --experimental-strip-types --test tests/cpaa-messaging.test.ts
 *
 * Convention: logic duplicated inline (same as transitions.test.ts) so the
 * test runs without module resolution through the experimental loader. If it
 * drifts from src/lib/messaging/green-api.ts or src/lib/cpaa/vat-message.ts,
 * update both.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── chatIdFromIsraeliPhone (same as green-api.ts) ───────────────────────────

function chatIdFromIsraeliPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 9 || !d.startsWith("5")) return null;
  return `972${d}@c.us`;
}

describe("chatIdFromIsraeliPhone", () => {
  it("0541234567 → 972541234567@c.us", () => {
    assert.equal(chatIdFromIsraeliPhone("0541234567"), "972541234567@c.us");
  });
  it("formatted 054-123-4567 normalises", () => {
    assert.equal(chatIdFromIsraeliPhone("054-123-4567"), "972541234567@c.us");
  });
  it("already +972 form normalises", () => {
    assert.equal(chatIdFromIsraeliPhone("+972541234567"), "972541234567@c.us");
  });
  it("landline / non-mobile (02…) → null", () => {
    assert.equal(chatIdFromIsraeliPhone("0212345678"), null);
  });
  it("garbage / empty → null (never guess a recipient)", () => {
    assert.equal(chatIdFromIsraeliPhone("abc"), null);
    assert.equal(chatIdFromIsraeliPhone(""), null);
    assert.equal(chatIdFromIsraeliPhone(null), null);
  });
});

// ── buildVatClientMessage (same as vat-message.ts) ──────────────────────────

interface VatMessageInput {
  clientName: string;
  periodLabel: string;
  noteB: number | null;
  footerDay?: number;
  signoff?: string;
}

function buildVatClientMessage(input: VatMessageInput): string | null {
  const { clientName, periodLabel, noteB } = input;
  if (noteB === null || noteB === 0) return null;
  const footerDay = input.footerDay ?? 19;
  const signoff = input.signoff ?? "בכבוד רב,\nמשרד ביטן את ביטן";
  const amount = `${noteB.toLocaleString("he-IL")} ₪`;
  return [
    `שלום ${clientName},`,
    `להלן פירוט התשלום לרשויות לתקופה ${periodLabel}:`,
    "",
    `מע"מ: ${amount}`,
    "",
    `סכום התשלומים: ${amount}`,
    "",
    "אופן/מועד תשלום:",
    `מע"מ — הוראת קבע ב-${footerDay} לחודש`,
    "",
    signoff,
  ].join("\n");
}

describe("buildVatClientMessage", () => {
  it("nothing to bill (null/0) → null, never an empty message", () => {
    assert.equal(buildVatClientMessage({ clientName: "x", periodLabel: "04/2026", noteB: null }), null);
    assert.equal(buildVatClientMessage({ clientName: "x", periodLabel: "04/2026", noteB: 0 }), null);
  });

  it("includes client, period, amount, footer day and firm sign-off", () => {
    const m = buildVatClientMessage({ clientName: "לקוח א׳", periodLabel: "04/2026", noteB: 4200 })!;
    assert.match(m, /שלום לקוח א׳,/);
    assert.match(m, /לתקופה 04\/2026/);
    assert.match(m, /מע"מ: 4,200 ₪/);
    assert.match(m, /סכום התשלומים: 4,200 ₪/);
    assert.match(m, /הוראת קבע ב-19 לחודש/);
    assert.match(m, /משרד ביטן את ביטן/);
  });

  it("footer day is configurable (open #5)", () => {
    const m = buildVatClientMessage({ clientName: "x", periodLabel: "p", noteB: 1, footerDay: 22 })!;
    assert.match(m, /הוראת קבע ב-22 לחודש/);
  });
});

// ── DryRunTransport + PacedSender 429 backoff (same as green-api.ts) ─────────

interface SendResult { idMessage: string; dryRun: boolean }
interface MessageTransport { send(chatId: string, message: string): Promise<SendResult> }

class GreenApiRateLimitError extends Error {}

class DryRunTransport implements MessageTransport {
  readonly sent: { chatId: string; message: string }[] = [];
  private seq = 0;
  async send(chatId: string, message: string): Promise<SendResult> {
    this.sent.push({ chatId, message });
    this.seq += 1;
    return { idMessage: `dryrun-${this.seq}`, dryRun: true };
  }
}

class PacedSender {
  transport: MessageTransport;
  opts: { maxRetries?: number; sleepFn?: (ms: number) => Promise<void> };
  constructor(
    transport: MessageTransport,
    opts: { maxRetries?: number; sleepFn?: (ms: number) => Promise<void> } = {},
  ) {
    this.transport = transport;
    this.opts = opts;
  }
  async sendOne(chatId: string, message: string): Promise<SendResult> {
    const { maxRetries = 4, sleepFn = async () => {} } = this.opts;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.transport.send(chatId, message);
      } catch (err) {
        const retriable = err instanceof GreenApiRateLimitError && attempt < maxRetries;
        if (!retriable) throw err;
        await sleepFn(0);
      }
    }
    throw new GreenApiRateLimitError("retries exhausted");
  }
}

describe("DryRunTransport", () => {
  it("records the message and returns a dryRun result (never really sends)", async () => {
    const t = new DryRunTransport();
    const r = await t.send("972541234567@c.us", "hello");
    assert.equal(r.dryRun, true);
    assert.match(r.idMessage, /^dryrun-/);
    assert.equal(t.sent.length, 1);
    assert.equal(t.sent[0].message, "hello");
  });
});

describe("PacedSender 429 backoff", () => {
  it("retries on rate-limit then succeeds", async () => {
    let calls = 0;
    const flaky: MessageTransport = {
      async send() {
        calls += 1;
        if (calls < 3) throw new GreenApiRateLimitError();
        return { idMessage: "ok", dryRun: false };
      },
    };
    const sender = new PacedSender(flaky, { sleepFn: async () => {} });
    const r = await sender.sendOne("c", "m");
    assert.equal(r.idMessage, "ok");
    assert.equal(calls, 3);
  });

  it("gives up after maxRetries and rethrows", async () => {
    const always: MessageTransport = {
      async send() {
        throw new GreenApiRateLimitError("nope");
      },
    };
    const sender = new PacedSender(always, { maxRetries: 2, sleepFn: async () => {} });
    await assert.rejects(() => sender.sendOne("c", "m"), /nope/);
  });
});
