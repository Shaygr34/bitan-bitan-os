/**
 * Stage 4–6 onboarding → Summit write-through.
 *
 * The "editing layer" write primitive: takes onboarding data values and writes
 * them through to the Summit client entity, but ONLY for fields that exist in
 * Summit today (registry rows with provisioning === 'exists'). Values targeting
 * not-yet-provisioned fields are returned as `skipped` rather than silently
 * dropped — so the caller (and the office) sees exactly what didn't land and
 * why, until Phase 1 provisioning closes the gap.
 *
 * Mirrors the proven write convention from
 * app/api/onboarding/advance/route.ts: POST /crm/data/updateentity/ with
 * { Credentials, Entity: { ID, Folder, Properties } }, then Status !== 0 check.
 * Nothing new about the transport — this only adds the registry-driven
 * Properties construction + a dry-run + an honest skipped[] audit.
 *
 * Unblocked by Phase 0: every field this writes already exists in the live
 * לקוחות schema (folder 557688522). Independent of the field-creation verdict
 * and of the blank בקשת רישום forms.
 */

import { ONBOARDING_FIELDS } from './summit-onboarding-fields'

const BASE_URL = 'https://api.sumit.co.il'
const CLIENTS_FOLDER = '557688522'

function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
}

/** Values keyed by the Summit field Name/APIName (matches summit-client.ts Properties keying). */
export type OnboardingFieldValues = Record<string, unknown>

export interface SkippedWrite {
  apiName: string
  reason: 'not-provisioned' | 'os-side-only' | 'decision-pending' | 'unknown-field'
}

export interface WriteResult {
  ok: boolean
  /** Field API names actually sent to Summit (or that would be, in dryRun). */
  written: string[]
  /** Values that did not map to a writable Summit field, with the reason. */
  skipped: SkippedWrite[]
  dryRun: boolean
  error?: string
}

const BY_API_NAME = new Map(
  ONBOARDING_FIELDS.filter((f) => f.summitApiName).map((f) => [f.summitApiName as string, f]),
)

/**
 * Split incoming values into the subset writable to Summit today vs. skipped.
 * Pure — safe to call for previews/UI without any network.
 */
export function partitionWritable(values: OnboardingFieldValues): {
  writable: Record<string, unknown>
  skipped: SkippedWrite[]
} {
  const writable: Record<string, unknown> = {}
  const skipped: SkippedWrite[] = []

  for (const [apiName, value] of Object.entries(values)) {
    const spec = BY_API_NAME.get(apiName)
    if (!spec) {
      skipped.push({ apiName, reason: 'unknown-field' })
      continue
    }
    switch (spec.provisioning) {
      case 'exists':
        writable[apiName] = value
        break
      case 'create':
        skipped.push({ apiName, reason: 'not-provisioned' })
        break
      case 'os-side':
        skipped.push({ apiName, reason: 'os-side-only' })
        break
      case 'decision':
        skipped.push({ apiName, reason: 'decision-pending' })
        break
    }
  }
  return { writable, skipped }
}

/**
 * Write onboarding field values through to a Summit client entity.
 *
 * @param entityId  Summit entity ID (the client).
 * @param values    Keyed by Summit field Name/APIName.
 * @param opts.dryRun  When true, validates + partitions but performs NO network
 *                     write. Matches the write-back plan's dry-run doctrine.
 */
export async function writeOnboardingFields(
  entityId: string,
  values: OnboardingFieldValues,
  opts: { dryRun?: boolean } = {},
): Promise<WriteResult> {
  const dryRun = !!opts.dryRun
  const { writable, skipped } = partitionWritable(values)
  const written = Object.keys(writable)

  if (written.length === 0) {
    return { ok: true, written: [], skipped, dryRun, error: undefined }
  }

  if (dryRun) {
    return { ok: true, written, skipped, dryRun: true }
  }

  const creds = getCredentials()
  if (!creds.APIKey) {
    return { ok: false, written: [], skipped, dryRun, error: 'Summit API credentials not configured' }
  }

  try {
    const res = await fetch(`${BASE_URL}/crm/data/updateentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        Entity: {
          ID: parseInt(entityId, 10),
          Folder: CLIENTS_FOLDER,
          Properties: writable,
        },
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, written: [], skipped, dryRun, error: `Summit API error: ${res.status} ${text}` }
    }

    const json = await res.json()
    if (json.Status !== 0) {
      return {
        ok: false,
        written: [],
        skipped,
        dryRun,
        error: `Summit error: ${json.UserErrorMessage || json.TechnicalErrorDetails || 'Unknown'}`,
      }
    }

    return { ok: true, written, skipped, dryRun: false }
  } catch (e) {
    return { ok: false, written: [], skipped, dryRun, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}
