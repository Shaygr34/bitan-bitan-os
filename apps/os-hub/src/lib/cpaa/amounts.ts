/**
 * CPAA amount model — the הערה-א' / הערה-ב' invariant (VAT slice).
 *
 * The load-bearing rule from the spec (§2d), stated precisely:
 *  - rawAmount  — the authority amount. Auto-pulled where it exists, else
 *                 manual / imported. A re-import (מיכפל etc.) MAY overwrite it.
 *  - הערה א'    — a FREE numeric adjustment (±). Manual. It is NEVER
 *                 overwritten by a re-import. This is the invariant.
 *  - הערה ב'    — the COMPUTED total = round2(raw + הערה א'). This is the
 *                 number sent to the client. A re-import changes raw →
 *                 הערה ב' recomputes, but הערה א' is preserved.
 *
 * Money is rounded to 2 decimals at every step so repeated import/compute
 * cycles never accumulate float drift. Pure + unwired; no DB, no Summit.
 */

export interface CpaaAmountState {
  /** null = no raw landed yet. */
  rawAmount: number | null;
  /** הערה א' — free ±. Defaults to 0, never auto-overwritten. */
  noteA: number;
  /** הערה ב' — computed total sent to client. null when there is no data. */
  noteB: number | null;
}

/** Round to 2 decimals (half-up on the cent), drift-free. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * הערה ב' = raw + הערה א'.
 * null only when there is genuinely no data (no raw AND no adjustment).
 * A non-zero הערה א' alone still yields a number (manual-only adjustment).
 */
export function computeNoteB(
  rawAmount: number | null,
  noteA: number,
): number | null {
  if (rawAmount === null && noteA === 0) return null;
  return round2((rawAmount ?? 0) + noteA);
}

/**
 * Apply a fresh raw amount (manual save or importer re-run).
 * INVARIANT: הערה א' is carried through untouched; הערה ב' recomputes.
 */
export function applyRawAmount(
  prev: CpaaAmountState,
  newRaw: number | null,
): CpaaAmountState {
  const rawAmount = newRaw === null ? null : round2(newRaw);
  return {
    rawAmount,
    noteA: prev.noteA, // ← never overwritten by a (re-)import
    noteB: computeNoteB(rawAmount, prev.noteA),
  };
}

/**
 * Edit הערה א' (a human adjusting the free correction).
 * raw is left exactly as-is; הערה ב' recomputes.
 */
export function setNoteA(
  prev: CpaaAmountState,
  newNoteA: number,
): CpaaAmountState {
  const noteA = round2(newNoteA);
  return {
    rawAmount: prev.rawAmount,
    noteA,
    noteB: computeNoteB(prev.rawAmount, noteA),
  };
}

/** A blank state — no raw, no adjustment. */
export function emptyAmountState(): CpaaAmountState {
  return { rawAmount: null, noteA: 0, noteB: null };
}
