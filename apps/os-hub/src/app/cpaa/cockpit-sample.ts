/**
 * DEMO data for the CPAA cockpit preview (read-first slice).
 *
 * ⚠ Entirely synthetic. No real client names or amounts — the
 * no-fabrication rule means real numbers only ever come from Summit /
 * verified importers, never seeded here. This array exists solely so the
 * `/cpaa` route renders standalone (no DB / no Summit call) for review.
 * It is removed when the cockpit is wired to the live ledger.
 */

import type { CockpitRow } from "./cockpit-types";

export const DEMO = true;

export const SAMPLE_ROWS: CockpitRow[] = [
  { id: "d1", clientName: "לקוח לדוגמה א׳", summitLinked: true, accountManager: "אבי ביטן", clientType: "עצמאי", vatInterval: "חודשי", year: 2026, periodLabel: "04/2026", noteB: null, colour: "GRAY", sendState: "טרם נשלח" },
  { id: "d2", clientName: "לקוח לדוגמה ב׳", summitLinked: true, accountManager: "רון ביטן", clientType: "חברה", vatInterval: "חודשי", year: 2026, periodLabel: "04/2026", noteB: 4200, colour: "ORANGE", sendState: "טרם נשלח" },
  { id: "d3", clientName: "לקוח לדוגמה ג׳", summitLinked: true, accountManager: "אבי ביטן", clientType: "עצמאי", vatInterval: "דו-חודשי", year: 2026, periodLabel: "03-04/2026", noteB: 1875, colour: "YELLOW", sendState: "טרם נשלח" },
  { id: "d4", clientName: "לקוח לדוגמה ד׳", summitLinked: true, accountManager: "רון ביטן", clientType: "שותפות", vatInterval: "חודשי", year: 2026, periodLabel: "04/2026", noteB: 9630, colour: "PURPLE", sendState: "טרם נשלח" },
  { id: "d5", clientName: "לקוח לדוגמה ה׳", summitLinked: true, accountManager: "אבי ביטן", clientType: "חברה", vatInterval: "חודשי", year: 2026, periodLabel: "04/2026", noteB: 12750, colour: "BLUE", sendState: "טרם נשלח" },
  { id: "d6", clientName: "לקוח לדוגמה ו׳", summitLinked: true, accountManager: "רון ביטן", clientType: "עצמאי", vatInterval: "חודשי", year: 2026, periodLabel: "04/2026", noteB: 3310, colour: "GREEN", sendState: "נשלח" },
  { id: "d7", clientName: "לקוח לדוגמה ז׳ (לא בסאמיט)", summitLinked: false, accountManager: "אבי ביטן", clientType: "עצמאי", vatInterval: "חודשי", year: 2026, periodLabel: "04/2026", noteB: 540, colour: "ORANGE", sendState: "טרם נשלח" },
  { id: "d8", clientName: "לקוח לדוגמה ח׳", summitLinked: true, accountManager: "רון ביטן", clientType: "עמותה", vatInterval: "דו-חודשי", year: 2025, periodLabel: "11-12/2025", noteB: 8800, colour: "GREEN", sendState: "נשלח" },
  { id: "d9", clientName: "לקוח לדוגמה ט׳", summitLinked: true, accountManager: "אבי ביטן", clientType: "חברה", vatInterval: "חודשי", year: 2025, periodLabel: "12/2025", noteB: 6120, colour: "BLUE", sendState: "טרם נשלח" },
];
