/**
 * GET /api/onboarding/signing/authorize/preview?token=...
 *
 * Read-only resolver for the magic-link landing page. Verifies the HMAC token,
 * looks up the matching onboardingRecord + signingTask, and returns metadata +
 * a short-lived 2Sign SAS URL to the client-signed PDF so the partner can
 * preview the document BEFORE clicking the authorize button.
 *
 * Does NOT materialize anything. The actual stamp/Sanity/Summit pipeline runs
 * only when POST /authorize is called from the confirm button.
 *
 * Statuses:
 *   200 { ok: true, ...metadata, signedDocUrl? }              — ready to authorize
 *   200 { ok: true, alreadyApplied: true, stampedDocUrl? }    — re-clicked old email
 *   401                                                        — bad / expired token
 *   404                                                        — record or task missing
 *   409 { status }                                             — task not at the gate
 *   500 { error }                                              — 2Sign fetch failed
 */
import { NextResponse } from 'next/server'
import { query } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'
import { verifyAuthorizeToken } from '@/lib/onboarding/authorize-token'
import { getSignedDocument } from '@/lib/onboarding/twosign-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const verified = verifyAuthorizeToken(token)
  if (!verified) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'invalid or expired token' } },
      { status: 401 },
    )
  }

  const { recordId, taskGuid } = verified

  const record = await query<OnboardingRecord | null>(
    `*[_type == "onboardingRecord" && _id == $recordId][0]{
      _id, accountManager, clientName, summitEntityId, signingTasks
    }`,
    { recordId },
  )
  if (!record) {
    return NextResponse.json({ error: 'record not found' }, { status: 404 })
  }

  const task = record.signingTasks?.find((t) => t.taskGuid === taskGuid)
  if (!task) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  }

  // Re-clicked old email — already materialized. Surface success state.
  if (task.status === 'signed' && (task.signedDocUrl || task.stampedDocUrl)) {
    return NextResponse.json({
      ok: true,
      alreadyApplied: true,
      clientName: record.clientName,
      summitEntityId: record.summitEntityId,
      documentType: task.documentType,
      stampedDocUrl: task.stampedDocUrl,
      signedDocUrl: task.signedDocUrl,
    })
  }

  if (task.status !== 'awaiting-office-authorize') {
    return NextResponse.json(
      { error: 'task is not awaiting office authorization', status: task.status },
      { status: 409 },
    )
  }

  // Fetch a fresh signed-PDF SAS URL for the preview iframe. Short-lived (~hours).
  let signedDocUrl: string | undefined
  try {
    const att = await getSignedDocument(taskGuid, 0)
    signedDocUrl = att.FileUrl
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed to fetch signed PDF'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    clientName: record.clientName,
    summitEntityId: record.summitEntityId,
    documentType: task.documentType,
    signedDocUrl,
  })
}
