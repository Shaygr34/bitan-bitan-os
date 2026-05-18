/**
 * Universal field-placement contract — the spine of the signing architecture
 * (Shay-directed inversion, 2026-05-18).
 *
 * One model consumed by all three layers:
 *   - Layer 1 (manual mini-app, #12): renders/edits a PlacementSpec.
 *   - Layer 2 (suggester, #11): produces a PlacementSpec (source:'suggested').
 *   - Layer 3 (learning loop, #13): persists manual specs, replays as 'learned'.
 *
 * Design rules baked in:
 *   - A spec is ALWAYS editable by a human. Auto never hard-places a legal-doc
 *     signature; it only seeds the spec the office confirms/adjusts.
 *   - Coordinates use the same convention as form-layouts.ts / RestampModal:
 *     CENTER coords, x from left, y FROM TOP, in PDF points. The PDF stamper
 *     converts center→top-left with real asset metrics on apply.
 *   - Every field carries its `source` so the UI can show provenance and the
 *     learning loop knows what a human actually corrected.
 *   - `pageIndex` is explicit (0-based) — nothing here assumes page 0. This is
 *     the core fix vs. the legacy pdf-marker/auto-stamp page-0 hardcode.
 *
 * This module is pure types + pure helpers. Zero imports, zero blast radius;
 * the shipped POA path does not touch it.
 */

export type FieldKind = 'signature' | 'date' | 'text' | 'stamp'
export type SignerRole = 'client' | 'office'
export type FieldSource = 'suggested' | 'learned' | 'manual'

/** Provenance of an anchor-resolved field, kept so Layer 3 can learn offsets. */
export interface AnchorProvenance {
  /** Heading token-set the position was resolved against (see pdf-anchor.ts). */
  tokens: string[]
  occurrence: 'first' | 'last'
  /** Field center relative to the resolved anchor, in points. */
  dxFromAnchor: number
  dyFromAnchor: number
}

export interface PlacedField {
  /**
   * Stable id within a spec. Semantic for known fields
   * ('client-signature', 'office-stamp', 'office-signature', 'client-date'…)
   * or a generated id for ad-hoc text the office adds.
   */
  id: string
  kind: FieldKind
  signer: SignerRole
  /** 0-based page index in the target PDF. Never assumed. */
  pageIndex: number
  /** Center x, points from left. */
  centerX: number
  /** Center y, points FROM TOP of the page. */
  centerYFromTop: number
  /** Image width in pt (stamp); height derived from real aspect on apply. */
  widthPt?: number
  /** Font size in pt (date/text). */
  fontSize?: number
  /** Literal text (text) or formatted date string (date). Unused for signature/stamp. */
  value?: string
  source: FieldSource
  anchor?: AnchorProvenance
  required?: boolean
  /** Human label for the draggable overlay. */
  label?: string
  /**
   * True when the suggester could NOT resolve a position and the field is
   * parked at a safe default for the office to place. The UI must visibly
   * flag these — this is the graceful-degradation contract (never a hard fail).
   */
  unresolved?: boolean
}

export type SpecOrigin = 'suggested' | 'learned' | 'manual' | 'mixed'

export interface PlacementSpec {
  /** Form-type key — the learning key and the suggester lookup key. */
  formType: string
  context?: { summitEntityId?: string; documentType?: string }
  fields: PlacedField[]
  origin: SpecOrigin
  /** ISO timestamp; set when a human applies the spec (Layer 3 input). */
  appliedAt?: string
}

/** Derive the overall origin from the field sources. */
export function deriveOrigin(fields: PlacedField[]): SpecOrigin {
  const s = new Set(fields.map((f) => f.source))
  if (s.size === 0) return 'manual'
  if (s.size === 1) return [...s][0] as SpecOrigin
  return 'mixed'
}

/**
 * Validate a spec before apply. Returns human-readable errors (Hebrew) —
 * empty array == safe to apply. Never throws.
 */
export function validatePlacementSpec(spec: PlacementSpec): string[] {
  const errs: string[] = []
  if (!spec.formType) errs.push('חסר סוג טופס (formType).')
  if (!spec.fields.length) errs.push('אין שדות למיקום.')
  for (const f of spec.fields) {
    if (f.pageIndex < 0) errs.push(`שדה ${f.id}: מספר עמוד לא תקין.`)
    if (!Number.isFinite(f.centerX) || !Number.isFinite(f.centerYFromTop))
      errs.push(`שדה ${f.id}: קואורדינטות חסרות/לא תקינות.`)
    if ((f.kind === 'text' || f.kind === 'date') && !f.value && f.source !== 'suggested')
      errs.push(`שדה ${f.id}: שדה טקסט/תאריך ללא ערך.`)
    if (f.kind === 'stamp' && !f.widthPt) errs.push(`שדה ${f.id}: חותמת ללא רוחב.`)
  }
  if (spec.fields.some((f) => f.unresolved))
    errs.push('יש שדות שלא אותרו אוטומטית — יש למקם אותם ידנית לפני אישור.')
  return errs
}

/** Apply a partial manual edit to one field (used by the mini-app on drag). */
export function moveField(
  spec: PlacementSpec,
  fieldId: string,
  centerX: number,
  centerYFromTop: number,
): PlacementSpec {
  return {
    ...spec,
    fields: spec.fields.map((f) =>
      f.id === fieldId
        ? { ...f, centerX, centerYFromTop, source: 'manual' as const, unresolved: false }
        : f,
    ),
    origin: deriveOrigin(
      spec.fields.map((f) => (f.id === fieldId ? { ...f, source: 'manual' as const } : f)),
    ),
  }
}
