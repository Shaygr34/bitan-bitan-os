/**
 * Layer 3 — the learning loop. Manual placements teach the suggester.
 *
 * Contract: every time a human APPLIES a placement (accepts or corrects the
 * suggestion in the mini-app), we record it per form-type. Next time that
 * form-type is suggested, the recorded placement supersedes the first-pass
 * offsets — so manual corrections compound toward the long-term aspiration
 * of full auto-mapping, without ever risking a hard failure to get there.
 *
 * Anchor-relative when possible: for anchored forms we store the field's
 * delta from its resolved anchor (dyFromAnchor), so a learned placement
 * generalizes across DIFFERENT documents of the same form-type, not just the
 * one PDF it was corrected on. Fixed forms store absolute center coords.
 *
 * Persistence: the real store is a Sanity document (one `learnedPlacement`
 * per form-type, or embedded on a settings doc) — cross-repo schema, same
 * pattern as onboardingRecord. That binding is the wiring step; this module
 * ships the interface + a process-memory default so the contract is usable
 * and unit-testable now. Pure logic (`mergeLearned`) is storage-agnostic.
 */

import {
  type PlacementSpec,
  type PlacedField,
  deriveOrigin,
} from './placement-model'

export interface LearnedField {
  fieldId: string
  /** Anchor-relative learned position (anchored forms). */
  anchor?: { tokens: string[]; occurrence: 'first' | 'last'; dyFromAnchor: number; centerX: number }
  /** Absolute learned position (fixed forms / ad-hoc). */
  absolute?: { pageIndex: number; centerX: number; centerYFromTop: number }
  widthPt?: number
  fontSize?: number
  /** How many human applies have reinforced this — confidence signal. */
  samples: number
  updatedAt: string
}

export interface LearnedPlacement {
  formType: string
  fields: LearnedField[]
}

export interface PlacementStore {
  getLearned(formType: string): Promise<LearnedPlacement | null>
  /** Record a human-applied spec. Reinforces existing learned fields. */
  recordApplied(spec: PlacementSpec): Promise<void>
}

/** Turn an applied field into its learned representation (anchor-relative if it has anchor provenance). */
function toLearnedField(f: PlacedField, prev?: LearnedField): LearnedField {
  const base: LearnedField = {
    fieldId: f.id,
    widthPt: f.widthPt,
    fontSize: f.fontSize,
    samples: (prev?.samples ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  }
  if (f.anchor) {
    base.anchor = {
      tokens: f.anchor.tokens,
      occurrence: f.anchor.occurrence,
      dyFromAnchor: f.anchor.dyFromAnchor,
      centerX: f.centerX,
    }
  } else {
    base.absolute = {
      pageIndex: f.pageIndex,
      centerX: f.centerX,
      centerYFromTop: f.centerYFromTop,
    }
  }
  return base
}

/**
 * Apply learned positions onto a fresh suggestion. Pure.
 *
 * - Anchored learned fields override only the y-offset/x (the suggester still
 *   re-resolves the live anchor on the actual document, then applies the
 *   learned delta — so it stays correct on variable-length PDFs).
 * - Absolute learned fields override the placement outright.
 * Matched fields are marked source:'learned'.
 */
export function mergeLearned(
  suggestion: PlacementSpec,
  learned: LearnedPlacement | null,
): PlacementSpec {
  if (!learned) return suggestion
  const byId = new Map(learned.fields.map((lf) => [lf.fieldId, lf]))
  const fields = suggestion.fields.map((f): PlacedField => {
    const lf = byId.get(f.id)
    if (!lf) return f
    if (lf.anchor && f.anchor) {
      // Keep the live-resolved anchor base; swap in the learned delta.
      const liveAnchorY = f.centerYFromTop - f.anchor.dyFromAnchor
      return {
        ...f,
        centerX: lf.anchor.centerX,
        centerYFromTop: liveAnchorY + lf.anchor.dyFromAnchor,
        anchor: { ...f.anchor, dyFromAnchor: lf.anchor.dyFromAnchor },
        widthPt: lf.widthPt ?? f.widthPt,
        fontSize: lf.fontSize ?? f.fontSize,
        source: 'learned',
        unresolved: false,
      }
    }
    if (lf.absolute) {
      return {
        ...f,
        pageIndex: lf.absolute.pageIndex,
        centerX: lf.absolute.centerX,
        centerYFromTop: lf.absolute.centerYFromTop,
        widthPt: lf.widthPt ?? f.widthPt,
        fontSize: lf.fontSize ?? f.fontSize,
        source: 'learned',
        unresolved: false,
      }
    }
    return f
  })
  return { ...suggestion, fields, origin: deriveOrigin(fields) }
}

/**
 * Process-memory store. Good for tests + a single server instance; replace
 * the body with the Sanity-backed binding for production durability across
 * deploys/instances (the documented wiring step).
 */
export class InMemoryPlacementStore implements PlacementStore {
  private map = new Map<string, LearnedPlacement>()

  async getLearned(formType: string): Promise<LearnedPlacement | null> {
    return this.map.get(formType) ?? null
  }

  async recordApplied(spec: PlacementSpec): Promise<void> {
    const existing = this.map.get(spec.formType)
    const prevById = new Map((existing?.fields ?? []).map((lf) => [lf.fieldId, lf]))
    const fields: LearnedField[] = spec.fields
      // Only human-touched placements teach (suggested-but-untouched ≠ signal).
      .filter((f) => f.source === 'manual' || f.source === 'learned')
      .map((f) => toLearnedField(f, prevById.get(f.id)))
    // Carry forward learned fields that weren't in this spec.
    for (const [id, lf] of prevById) if (!fields.some((x) => x.fieldId === id)) fields.push(lf)
    this.map.set(spec.formType, { formType: spec.formType, fields })
  }
}
