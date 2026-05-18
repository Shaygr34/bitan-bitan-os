/**
 * Phase-1 field provisioning plan.
 *
 * CONFIRMED 2026-05-18 (live investigation of the Summit MCP by the MCP's
 * author, verbatim verdict relayed by Shay): the Summit MCP / Sumit API has
 * NO schema-DDL capability. 16-tool surface is row-create + existing-field
 * value-update only; `get_folder_schema` is read-only with no write twin;
 * there is no `(folder, propertyName, propertyType)` tool. A speculative
 * "שדות נוספים" meta-folder (ID 1192247885) MIGHT register field defs via
 * create_entity, but it is undocumented, has no rollback path, and is
 * explicitly OUT OF SCOPE / warranty-voiding — do NOT probe it.
 *
 * Therefore field provisioning is a **human, one-time, Sumit-UI task**
 * (app.sumit.co.il → folder settings → add property). There is intentionally
 * no `ApiProvisioner` — that branch is dead by confirmed contract, not by
 * "not yet implemented". This module's job is to make the manual step
 * turnkey: emit the exact, ordered, grouped checklist the office actions once,
 * so the OS can then read/write/filter those fields normally.
 */

import {
  getProvisioningWorklist,
  getOpenDecisions,
  type OnboardingFieldSpec,
} from './summit-onboarding-fields'

/** Confirmed capability boundary, encoded so the codebase carries the verdict (not just docs/memory). */
export const SUMMIT_SCHEMA_CAPABILITY = {
  canCreateFields: false,
  confirmedOn: '2026-05-18',
  method: 'live MCP investigation by MCP author, relayed by Shay',
  provisioningPath: 'sumit-ui-human-one-time',
  doNotProbe: 'שדות נוספים meta-folder 1192247885 — undocumented, no rollback, out of scope',
} as const

export interface ProvisioningStep {
  /** 1-based order the office should follow. */
  order: number
  field: string
  valueType: OnboardingFieldSpec['valueType']
  /** Target Summit category (the "add property" dialog's category dropdown). */
  category: string
  /** New Summit category to create first (only set on the first field of a new category). */
  createsCategory?: string
  notes?: string
}

const NEW_CATEGORY_HINT = 'בן/בת זוג'

/**
 * Build the office's one-time Sumit-UI provisioning checklist.
 *
 * Grouped so a brand-new category (בן/בת זוג) is created once, then its
 * fields, then the singleton fields by their target category. Pure — no
 * network, safe for UI/preview/report generation.
 */
export function buildProvisioningChecklist(
  opts?: { atzmaiSliceOnly?: boolean },
): ProvisioningStep[] {
  const rows = getProvisioningWorklist({ atzmaiSliceOnly: opts?.atzmaiSliceOnly })

  // New-category fields first (so the category exists before its fields),
  // then everything else grouped by category for fewer context switches.
  const spouse = rows.filter((r) => r.category === NEW_CATEGORY_HINT)
  const rest = rows
    .filter((r) => r.category !== NEW_CATEGORY_HINT)
    .sort((a, b) => a.category.localeCompare(b.category, 'he'))

  const ordered = [...spouse, ...rest]

  return ordered.map((r, i) => ({
    order: i + 1,
    field: r.dataPoint,
    valueType: r.valueType,
    category: r.category,
    createsCategory:
      r.category === NEW_CATEGORY_HINT && spouse[0] === r ? NEW_CATEGORY_HINT : undefined,
    notes: r.notes,
  }))
}

/** Decisions Shay/Ron must resolve before the office runs the checklist. */
export function getProvisioningDecisions(): OnboardingFieldSpec[] {
  return getOpenDecisions()
}

/** One-line human summary for status docs. */
export function summarizeProvisioning(opts?: { atzmaiSliceOnly?: boolean }): string {
  const steps = buildProvisioningChecklist(opts)
  const decisions = getProvisioningDecisions()
  const spouseCount = steps.filter((s) => s.category === NEW_CATEGORY_HINT).length
  return (
    `${steps.length} fields to add once in Sumit UI ` +
    `(${spouseCount} in a new "${NEW_CATEGORY_HINT}" category, ${steps.length - spouseCount} singletons), ` +
    `${decisions.length} decisions pending. API auto-provisioning is confirmed unavailable.`
  )
}
