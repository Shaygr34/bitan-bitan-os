/**
 * GET /api/cron/signing-poll
 *
 * Scheduler-driven 2Sign poll for non-terminal signing tasks.
 * Mirrors what `/api/onboarding/signing` GET does for the page-presence
 * path, but runs without anyone having the detail page open.
 *
 * Why this exists: prior to this route, signing transitions were captured
 * only while the detail page was mounted (30s setInterval in
 * onboarding/[entityId]/page.tsx). Avi/Ron's workflow is "send → close →
 * wait for email" — meaning the page was almost never open at the moment
 * the client signed, so 'sent' tasks froze in Sanity and Avi never got
 * the completion email.
 *
 * Auth: Bearer CRON_SECRET (same env var used by /api/cron/ingest).
 *
 * Schedule: GitHub Actions cron @ 10-min interval.
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://host/api/cron/signing-poll
 *
 * Idempotent: pollRecord skips terminal tasks and stamps notifiedAt to
 * prevent duplicate emails on subsequent runs.
 */

import { NextResponse } from 'next/server'
import { cronSecret } from '@/config/integrations'
import { query } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'
import { pollRecord } from '@/lib/onboarding/signing-poller'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Records with at least one non-fully-settled task. Mirrors `isFullySettled()` in signing-poller.ts:
//   - Not signed/declined/expired/external-done → always poll
//   - Signed but missing artifact (no signedDocUrl AND no stampedDocUrl) and retry budget not exhausted →
//     poll so the corrected GetSignedTaskLocationBlob endpoint can populate the PDF on next tick.
//     Without this branch, ghost-completed records (status=signed + notifiedAt stamped + signedDocUrl=null)
//     stay invisible to the cron forever — which is exactly what produced the 4 frozen records pre-PR #124.
// External and manual taskGuids are skipped inside pollRecord — but we still want their parent
// records included if they ALSO carry a 2Sign task in flight.
const NON_TERMINAL_QUERY = `
  *[_type == "onboardingRecord" && count(signingTasks[
    (status != "signed" && status != "declined" && status != "expired" && status != "external-done") ||
    (status == "signed" && !defined(signedDocUrl) && !defined(stampedDocUrl) && coalesce(pdfFetchAttempts, 0) < 5)
  ]) > 0]{
    _id,
    summitEntityId,
    clientName,
    accountManager,
    signingTasks
  }
`

export async function GET(request: Request) {
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (token !== cronSecret) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing CRON_SECRET' } },
        { status: 401 }
      )
    }
  }

  try {
    const records = await query<OnboardingRecord[]>(NON_TERMINAL_QUERY)

    if (!records || records.length === 0) {
      return NextResponse.json({ message: 'No records with non-terminal signing tasks', polled: 0 })
    }

    // Sequential polling — 2Sign API is rate-sensitive and we'd rather take a few extra
    // seconds than risk 429s. Typical pool size is small (<20 active POAs at any time).
    const results = []
    for (const record of records) {
      try {
        const result = await pollRecord(record)
        results.push({
          recordId: record._id,
          summitEntityId: record.summitEntityId,
          newlySigned: result.newlySigned,
          stageAdvancedTo: result.stageAdvancedTo,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[cron/signing-poll] pollRecord failed for', record._id, message)
        results.push({
          recordId: record._id,
          summitEntityId: record.summitEntityId,
          error: message,
        })
      }
    }

    const totalSigned = results.reduce((sum, r) => sum + (r.newlySigned || 0), 0)
    console.log(`[cron/signing-poll] Polled ${records.length} records, ${totalSigned} newly signed`)

    return NextResponse.json({
      message: `Polled ${records.length} records, ${totalSigned} newly signed`,
      polled: records.length,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/signing-poll] error:', message)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    )
  }
}
