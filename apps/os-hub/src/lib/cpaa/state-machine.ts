/**
 * CPAA colour state machine ("מסך CPA" row colours).
 *
 * Two parts, mirroring `content-factory/transitions.ts`:
 *  1. A declared transition map — every move must be explicit (no implicit
 *     transitions). Manual override at the application layer is an audited
 *     escape hatch, not a declared transition.
 *  2. `deriveColourState` — the business rule that computes the colour a
 *     report SHOULD be in, given its OS-ledger state + the one Summit-derived
 *     signal.
 *
 * LOCKED decisions (Shay, 2026-05-18) baked in here:
 *  - #1: the firm files VAT 100% inside Summit and the OS never transmits, so
 *    BLUE (שודר ושולם) is derived from Summit's `Books_LastVATHistoryDate`
 *    reaching the period end. It is the ONLY Summit-readable state in the
 *    chain — Phase-0 probe proved there is no Summit per-period status field.
 *  - PURPLE (סגול / אישור דיווח) is OS-owned manual — the field the spec
 *    assumed in Summit does not exist.
 *  - #3: GREEN (ירוק) fires ONLY on a successful client send (Green API
 *    idMessage). It is the single green trigger and a terminal state.
 */

import type { CpaaColourState } from "@prisma/client";

// ── Declared transitions ────────────────────────────────────────────────────
// Forward progression + bounded backward moves for corrections. GREEN is
// terminal (full closure); an after-send correction is an app-layer audited
// override, not a declared move — same convention as Article ARCHIVED.

const CPAA_COLOUR_TRANSITIONS: Record<CpaaColourState, CpaaColourState[]> = {
  GRAY: ["ORANGE"],
  ORANGE: ["YELLOW", "PURPLE", "GRAY"],
  YELLOW: ["PURPLE", "ORANGE"],
  PURPLE: ["BLUE", "YELLOW"],
  BLUE: ["GREEN", "PURPLE"],
  GREEN: [],
};

export type TransitionError = {
  code: "INVALID_TRANSITION";
  message: string;
  from: string;
  to: string;
};

export function validateColourTransition(
  from: CpaaColourState,
  to: CpaaColourState,
): TransitionError | null {
  if (CPAA_COLOUR_TRANSITIONS[from].includes(to)) return null;
  return {
    code: "INVALID_TRANSITION",
    message: `CPAA report cannot transition from ${from} to ${to}`,
    from,
    to,
  };
}

// ── Derivation ──────────────────────────────────────────────────────────────

export interface ColourDeriveInput {
  /** Weak Summit proxy (Books_LastReceivedDocuments covers the period). */
  materialsReceived: boolean;
  /** OS ledger has a raw amount for this report (CpaaReport.rawAmount != null). */
  rawAmountPresent: boolean;
  /** OS flag — completions done (השלמות). */
  completionsDone: boolean;
  /** OS-owned manual approval (סגול / אישור דיווח) — no Summit field exists. */
  approved: boolean;
  /** Snapshot of Summit Books_LastVATHistoryDate, or null if never filed. */
  summitFiledDate: Date | null;
  /** This report's period end — BLUE fires when the filed date reaches it. */
  periodEnd: Date;
  /** Green API idMessage returned (client message sent) — the only GREEN trigger. */
  clientMessageSent: boolean;
}

/**
 * Compute the colour a report should be in.
 * Precedence (highest wins): GREEN > BLUE > PURPLE > YELLOW > ORANGE > GRAY.
 */
export function deriveColourState(i: ColourDeriveInput): CpaaColourState {
  // ירוק — full closure. Only ever set by a successful client send (#3).
  if (i.clientMessageSent) return "GREEN";

  // כחול — שודר ושולם. The ONLY Summit-derived state (#1): the firm files VAT
  // inside Summit, so the filed-date watermark reaching the period end means
  // the report was transmitted and paid.
  if (i.summitFiledDate && i.summitFiledDate.getTime() >= i.periodEnd.getTime()) {
    return "BLUE";
  }

  // סגול — אישור דיווח. OS-owned manual (assumed Summit field does not exist).
  if (i.approved) return "PURPLE";

  // צהוב — raw entered + completions.
  if (i.rawAmountPresent && i.completionsDone) return "YELLOW";

  // כתום — raw amount saved, OR Summit shows materials received (הנה"ח התקבל).
  if (i.rawAmountPresent || i.materialsReceived) return "ORANGE";

  // אפור — nothing yet.
  return "GRAY";
}

// ── UI metadata (pure; kept here so the colour contract has one home) ────────

export const CPAA_COLOUR_META: Record<
  CpaaColourState,
  { he: string; meaning: string; source: "os" | "os-manual" | "summit-derived" }
> = {
  GRAY: { he: "אפור בהיר", meaning: "אין נתונים", source: "os" },
  ORANGE: { he: "כתום בהיר", meaning: "גלם נשמר / הנה\"ח התקבל", source: "os" },
  YELLOW: { he: "צהוב בהיר", meaning: "הוקלד, השלמות", source: "os" },
  PURPLE: { he: "סגול", meaning: "אישור דיווח", source: "os-manual" },
  BLUE: { he: "כחול בהיר", meaning: "שודר ושולם", source: "summit-derived" },
  GREEN: { he: "ירוק בהיר", meaning: "נשלח ללקוח", source: "os" },
};

// ── Exported map (for tests) ────────────────────────────────────────────────

export { CPAA_COLOUR_TRANSITIONS };
