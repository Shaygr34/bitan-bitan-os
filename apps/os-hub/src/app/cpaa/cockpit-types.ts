/**
 * View-model types for the CPAA cockpit (read-first, VAT slice).
 *
 * The colour contract is single-sourced from the OS state machine
 * (`@/lib/cpaa/state-machine`) — the cockpit only ever displays a
 * `CpaaColourState`, it never re-defines the palette.
 */

import type { CpaaColourState } from "@prisma/client";

export type { CpaaColourState };

export type CpaaVatInterval = "חודשי" | "דו-חודשי";
export type CpaaSendState = "טרם נשלח" | "נשלח";

/** One cockpit row = one VAT report period for one client. */
export interface CockpitRow {
  id: string;
  clientName: string;
  /** false ⇒ "לקוח שלא נמצא בסאמיט" — first-class, not an edge case. */
  summitLinked: boolean;
  accountManager: string;
  clientType: string;
  vatInterval: CpaaVatInterval;
  year: number;
  periodLabel: string;
  /** הערה ב' — the computed total sent to the client. null = no data yet. */
  noteB: number | null;
  colour: CpaaColourState;
  sendState: CpaaSendState;
}

export interface CockpitFilters {
  accountManager: string;
  clientType: string;
  vatInterval: string;
  colour: string;
  sendState: string;
  year: number;
}
