/**
 * Layer 2 — the suggester. PROPOSES a PlacementSpec; never hard-places.
 *
 * Two sources of a suggestion:
 *   - Anchored forms (e.g. בקשת רישום, variable-length): resolve section
 *     headings via pdf-anchor.ts, offset to the signature line using offsets
 *     MEASURED from the real sample (no-fabrication — see ANCHORED_FORMS).
 *   - Fixed forms (the shipped POAs): read FORM_LAYOUTS as-is (page 0). The
 *     legacy pdf-marker/auto-stamp path is untouched; this only lets the
 *     universal manual mini-app also seed those flows.
 *
 * GRACEFUL DEGRADATION CONTRACT (the locked principle, enforced here):
 * suggestPlacements NEVER throws. If an anchor cannot be resolved the field
 * is returned `unresolved: true` parked at a safe default for the office to
 * place by hand. A failed auto-resolve is a manual task, never a hard failure.
 *
 * Offsets below are FIRST-PASS from the real יונתן רועי sample (612×792, last
 * page: §י heading yTop≈109 / §יא heading yTop≈300). They are deliberately
 * NOT asserted pixel-perfect — they need exactly one visual-QA tuning pass
 * against a real 2Sign/print render, the same way the POA coords were tuned
 * via Chrome-QA (#126–#129). The learning loop (#13) supersedes them per
 * form-type once a human confirms a placement.
 */

import { resolveAnchor, type AnchorSpec } from './pdf-anchor'
import { FORM_LAYOUTS } from './form-layouts'
import {
  type PlacementSpec,
  type PlacedField,
  deriveOrigin,
} from './placement-model'

interface AnchoredFieldDef {
  id: string
  kind: PlacedField['kind']
  signer: PlacedField['signer']
  anchor: AnchorSpec
  /** Absolute center x in pt (horizontal is template-fixed; only y flows). */
  centerX: number
  /** Center y = resolved anchor yFromTop + this delta (measured). */
  dyFromAnchor: number
  widthPt?: number
  fontSize?: number
  required?: boolean
  label: string
}

interface AnchoredFormDef {
  /** Human entity kind this layout serves. */
  note: string
  fields: AnchoredFieldDef[]
}

/**
 * Anchored form registry. Keyed by form-type. Offsets measured 2026-05-18
 * from יונתן רועי (עצמאי / יחיד). Date is intentionally absent — this form
 * pre-prints its own generation date, so we sign only (a key difference vs
 * the POAs, which need a 2Sign date auto-fill).
 */
export const ANCHORED_FORMS: Record<string, AnchoredFormDef> = {
  'reg-request-self-employed': {
    note: 'בקשת רישום לצרכי מע"מ — עצמאי/יחיד. §י client declaration, §יא Bitan rep.',
    fields: [
      {
        id: 'client-signature',
        kind: 'signature',
        signer: 'client',
        anchor: { tokens: ['הצהרת', 'העוסק'], occurrence: 'last' },
        centerX: 210,
        dyFromAnchor: 87, // §י heading yTop≈109 → signing line ≈196 (just above the "חתימה" caption ≈210)
        required: true,
        label: 'חתימת העוסק (§י)',
      },
      // §יא is ONE office mark: the manager-stamps.ts PNG is already a
      // combined signature + firm stamp. QA 2026-05-18 (visual, real form)
      // showed a separate office-signature + office-stamp double-stamped the
      // same PNG — so this is a single field. Offset tuned from the render:
      // dy 112 lands the mark on the §יא חתימה line (caption ≈426, line ≈412).
      {
        id: 'office-stamp',
        kind: 'stamp',
        signer: 'office',
        anchor: { tokens: ['המייצג', 'והצהרתו'], occurrence: 'last' },
        centerX: 165,
        dyFromAnchor: 112,
        widthPt: 90,
        required: true,
        label: 'חתימה + חותמת ביטן את ביטן (§יא)',
      },
    ],
  },
}

const FALLBACK_DEFAULT = { centerX: 300, centerYFromTop: 400 }

/**
 * Produce a suggested PlacementSpec for a document. Never throws.
 *
 * @param pdfBuffer  the target PDF (needed for anchored resolution).
 * @param formType   ANCHORED_FORMS key or a FORM_LAYOUTS key.
 */
export async function suggestPlacements(
  pdfBuffer: Buffer,
  formType: string,
  context?: PlacementSpec['context'],
): Promise<PlacementSpec> {
  const anchored = ANCHORED_FORMS[formType]
  if (anchored) {
    const fields: PlacedField[] = []
    for (const def of anchored.fields) {
      try {
        const r = await resolveAnchor(pdfBuffer, def.anchor)
        fields.push({
          id: def.id,
          kind: def.kind,
          signer: def.signer,
          pageIndex: r.pageIndex,
          centerX: def.centerX,
          centerYFromTop: r.anchorYFromTop + def.dyFromAnchor,
          widthPt: def.widthPt,
          fontSize: def.fontSize,
          source: 'suggested',
          anchor: {
            tokens: def.anchor.tokens,
            occurrence: def.anchor.occurrence ?? 'last',
            dxFromAnchor: def.centerX - r.anchorX,
            dyFromAnchor: def.dyFromAnchor,
          },
          required: def.required,
          label: def.label,
        })
      } catch {
        // Graceful degradation — park unresolved for manual placement.
        fields.push({
          id: def.id,
          kind: def.kind,
          signer: def.signer,
          pageIndex: 0,
          centerX: def.centerX,
          centerYFromTop: FALLBACK_DEFAULT.centerYFromTop,
          widthPt: def.widthPt,
          fontSize: def.fontSize,
          source: 'suggested',
          required: def.required,
          label: def.label,
          unresolved: true,
        })
      }
    }
    return { formType, context, fields, origin: deriveOrigin(fields) }
  }

  // Fixed form (shipped POA) — seed from FORM_LAYOUTS, page 0. Read-only;
  // the legacy signing path is not modified.
  const layout = FORM_LAYOUTS[formType]
  if (layout) {
    const fields: PlacedField[] = [
      {
        id: 'client-signature',
        kind: 'signature',
        signer: 'client',
        pageIndex: 0,
        centerX: layout.clientSignature.x,
        centerYFromTop: layout.clientSignature.yFromTop,
        source: 'suggested',
        required: true,
        label: 'חתימת לקוח',
      },
    ]
    if (layout.officeStamp) {
      fields.push({
        id: 'office-stamp',
        kind: 'stamp',
        signer: 'office',
        pageIndex: 0,
        centerX: layout.officeStamp.x + layout.officeStamp.widthPt / 2,
        centerYFromTop: layout.officeStamp.yFromTop,
        widthPt: layout.officeStamp.widthPt,
        source: 'suggested',
        label: 'חותמת המשרד',
      })
    }
    return { formType, context, fields, origin: 'suggested' }
  }

  // Unknown form — empty spec, fully manual. Still not a hard failure.
  return { formType, context, fields: [], origin: 'manual' }
}
