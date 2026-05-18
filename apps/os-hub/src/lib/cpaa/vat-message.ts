/**
 * CPAA VAT (מע"מ) client-message builder — the CPAA-specific piece on top of
 * the shared Green API transport (`src/lib/messaging/green-api.ts`).
 *
 * Spec §2f rules applied for the VAT slice: a line appears ONLY if its amount
 * ≠ 0; "סכום התשלומים" totals it; a payment-method/day footer; firm sign-off.
 * VAT-only ⇒ a single amount line. The footer day is configurable (open #5;
 * default 19 = מע"מ הוראת-קבע day) — not hard-coded into the template logic.
 *
 * If there is nothing to bill (no/zero הערה ב') the builder returns null:
 * the caller must NOT send an empty message (no fabrication).
 */

export interface VatMessageInput {
  clientName: string;
  periodLabel: string;
  /** הערה ב' — the computed total to pay. null/0 ⇒ nothing to send. */
  noteB: number | null;
  /** הוראת-קבע day for VAT. Default 19 (configurable per firm — open #5). */
  footerDay?: number;
  /** Override the firm sign-off if ever needed (productization). */
  signoff?: string;
}

const DEFAULT_FOOTER_DAY = 19;
const DEFAULT_SIGNOFF = "בכבוד רב,\nמשרד ביטן את ביטן";

function formatIls(n: number): string {
  return `${n.toLocaleString("he-IL")} ₪`;
}

/**
 * Build the VAT client message body, or null when there is nothing to bill.
 */
export function buildVatClientMessage(input: VatMessageInput): string | null {
  const { clientName, periodLabel, noteB } = input;
  if (noteB === null || noteB === 0) return null;

  const footerDay = input.footerDay ?? DEFAULT_FOOTER_DAY;
  const signoff = input.signoff ?? DEFAULT_SIGNOFF;
  const amount = formatIls(noteB);

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
