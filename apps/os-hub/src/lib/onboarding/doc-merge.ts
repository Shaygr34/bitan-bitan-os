/**
 * Stage-4 document-merge manifest (spec §77).
 *
 * Pure logic — no PDF I/O here, just the ORDERING contract the office's
 * "select which docs to merge" UI produces, so the actual pdf-lib merge step
 * (built later) and any preview both consume one source of truth.
 *
 * Spec rules encoded:
 *  - Merge order = the office's selection order (first ticked = first in PDF).
 *  - Only present + selected docs are included.
 *  - ייפוי כח רשות המסים IS part of the merge.
 *  - ייפוי כח ביטוח לאומי is NOT required for / included in this merge.
 *  - The merged doc is uploaded to the authority WITHOUT saving to Summit yet.
 *  - After submission, the אישור הגשה is appended to produce the final
 *    "central" document, which IS saved to Summit (the existing
 *    `פתיחת תיק רשויות / ייפוי כח` File field).
 */

export interface MergeDoc {
  /** Stable doc key (matches the registry / DocumentsCard doc keys). */
  key: string
  label: string
  /** Whether the doc actually exists/uploaded for this client. */
  present: boolean
  /** Resolvable source (Sanity CDN URL / Summit ref). Opaque to this module. */
  source?: string
}

export interface MergeManifestEntry {
  order: number
  key: string
  label: string
  source?: string
}

/** Doc keys that must never enter the authority-submission merge (spec §77). */
const EXCLUDED_FROM_MERGE = new Set<string>([
  'poa-nii-withholdings',
  'poa-nii-representatives',
])

export interface BuildMergeOptions {
  /** Office tick order — doc keys in the sequence the office selected them. */
  selectionOrder: string[]
}

/**
 * Build the ordered merge manifest from the available docs + the office's
 * selection order. Pure and deterministic.
 *
 * - Unknown keys in selectionOrder are ignored.
 * - Missing (`present === false`) docs are skipped (returned in `skipped`).
 * - Excluded docs (ב"ל POA) are skipped even if selected.
 */
export function buildMergeManifest(
  docs: MergeDoc[],
  opts: BuildMergeOptions,
): { manifest: MergeManifestEntry[]; skipped: { key: string; reason: 'missing' | 'excluded' | 'unknown' }[] } {
  const byKey = new Map(docs.map((d) => [d.key, d]))
  const manifest: MergeManifestEntry[] = []
  const skipped: { key: string; reason: 'missing' | 'excluded' | 'unknown' }[] = []
  let order = 1

  for (const key of opts.selectionOrder) {
    if (EXCLUDED_FROM_MERGE.has(key)) {
      skipped.push({ key, reason: 'excluded' })
      continue
    }
    const doc = byKey.get(key)
    if (!doc) {
      skipped.push({ key, reason: 'unknown' })
      continue
    }
    if (!doc.present) {
      skipped.push({ key, reason: 'missing' })
      continue
    }
    manifest.push({ order: order++, key: doc.key, label: doc.label, source: doc.source })
  }

  return { manifest, skipped }
}

/**
 * After authority submission, append the אישור הגשה to the merged doc to
 * produce the final central document (the one saved to Summit's
 * `פתיחת תיק רשויות / ייפוי כח` field).
 */
export function appendSubmissionConfirmation(
  manifest: MergeManifestEntry[],
  confirmation: { label: string; source?: string },
): MergeManifestEntry[] {
  const nextOrder = manifest.length ? manifest[manifest.length - 1].order + 1 : 1
  return [
    ...manifest,
    { order: nextOrder, key: 'submission-confirmation', label: confirmation.label, source: confirmation.source },
  ]
}
