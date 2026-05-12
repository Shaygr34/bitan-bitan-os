/**
 * POST /api/onboarding/signing/authorize
 *
 * Body: { token: string }
 *
 * Office authorize-gate (Option C). Verifies an HMAC magic-link token, locates
 * the matching onboardingRecord + signingTask, and runs the full materialize
 * pipeline (PDF fetch → stamp → Sanity → Summit הערה → stage advance).
 *
 * Statuses:
 *   200 { ok: true, stampedDocUrl?, signedDocUrl? }    — materialized this call
 *   200 { ok: true, alreadyApplied: true }              — idempotent re-click
 *   401                                                  — bad / expired token
 *   404                                                  — record or task missing
 *   409 { status }                                       — task not at the gate
 *   500 { error }                                        — materializer failed
 */
import { NextResponse } from 'next/server'
import { query } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'
import { verifyAuthorizeToken } from '@/lib/onboarding/authorize-token'
import { materializeSignedArtifact } from '@/lib/onboarding/signing-poller'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  let body: { token?: string }
  try {
    body = (await request.json()) as { token?: string }
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const token = body?.token
  if (!token || typeof token !== 'string') {
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

  // Idempotent: a task already moved through to 'signed' with an artifact is a
  // re-clicked old email. Return success so the UI shows the friendly state.
  if (task.status === 'signed' && (task.signedDocUrl || task.stampedDocUrl)) {
    return NextResponse.json({
      ok: true,
      alreadyApplied: true,
      stampedDocUrl: task.stampedDocUrl,
      signedDocUrl: task.signedDocUrl,
      clientName: record.clientName,
      summitEntityId: record.summitEntityId,
    })
  }

  // Anything other than the gate is a defensive mismatch (manual rollback,
  // legacy ghost record, etc.). Surface the actual status so the UI can route.
  if (task.status !== 'awaiting-office-authorize') {
    return NextResponse.json(
      { error: 'task is not awaiting office authorization', status: task.status },
      { status: 409 },
    )
  }

  const result = await materializeSignedArtifact(record, taskGuid)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'materialization failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    stampedDocUrl: result.stampedDocUrl,
    signedDocUrl: result.signedDocUrl,
    clientName: record.clientName,
    summitEntityId: record.summitEntityId,
  })
}
