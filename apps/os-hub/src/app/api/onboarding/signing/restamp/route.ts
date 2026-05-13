/**
 * POST /api/onboarding/signing/restamp
 *
 * Path B of the office manual-overtake flow (paired with Path A in
 * /api/onboarding/signing with isManualSign).
 *
 * Takes coordinate overrides for the office stamp + date, fetches the
 * preserved pre-stamp PDF for the task, re-runs applyOfficeStamp with the
 * overrides, persists the new stamped PDF, and updates the SigningTask.
 *
 * Requires that preStampDocUrl exists on the task — populated by
 * signing-poller the first time auto-stamp ran. For older records signed
 * before that field was introduced, this route 412s and the UI should
 * disable the restamp action.
 */

import { NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'
import type { OnboardingRecord, SigningTask } from '@/lib/onboarding/types'
import { applyOfficeStamp, type ApplyStampCoordOverrides } from '@/lib/onboarding/auto-stamp'
import {
  uploadSignedPdfToSanity,
  addSignedDocRemarkToSummit,
  getSignedDocLabel,
} from '@/lib/onboarding/signed-doc-storage'
import { resolveStampOwner } from '@/lib/onboarding/manager-stamps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RestampRequestBody {
  summitEntityId: string
  documentType: string
  coordOverrides: ApplyStampCoordOverrides
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RestampRequestBody>
    const { summitEntityId, documentType, coordOverrides } = body

    if (!summitEntityId || !documentType || !coordOverrides) {
      return NextResponse.json(
        { error: 'summitEntityId, documentType, and coordOverrides are required' },
        { status: 400 },
      )
    }

    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, signingTasks, clientName, accountManager, summitEntityId }`,
      { eid: summitEntityId },
    )
    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 })
    }

    const tasks: SigningTask[] = record.signingTasks || []
    const idx = tasks.findIndex((t) => t.documentType === documentType)
    if (idx < 0) {
      return NextResponse.json({ error: 'Task not found for documentType' }, { status: 404 })
    }
    const target = tasks[idx]

    // Path B requires a preserved pre-stamp PDF. Records signed before
    // preStampDocUrl was introduced won't have one; UI disables the button.
    if (!target.preStampDocUrl) {
      return NextResponse.json(
        {
          error: 'Pre-stamp PDF not preserved for this task. Re-stamp not available — use Path A (upload pre-signed) instead.',
          code: 'NO_PRE_STAMP',
        },
        { status: 412 },
      )
    }

    // Form type drives layout lookup inside applyOfficeStamp.
    const stampKey = target.formType || target.documentType

    // Fetch the pre-stamp PDF.
    const preStampRes = await fetch(target.preStampDocUrl)
    if (!preStampRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch pre-stamp PDF: HTTP ${preStampRes.status}` },
        { status: 502 },
      )
    }
    const preStampBuf = Buffer.from(await preStampRes.arrayBuffer())

    // Re-stamp.
    const manager = resolveStampOwner(record.accountManager)
    let stampedBuf: Buffer
    try {
      stampedBuf = await applyOfficeStamp(preStampBuf, {
        formType: stampKey,
        manager,
        alsoFillClientDate: true,
        coordOverrides,
      })
    } catch (stampErr) {
      const msg = stampErr instanceof Error ? stampErr.message : String(stampErr)
      return NextResponse.json({ error: `Re-stamp failed: ${msg}` }, { status: 500 })
    }

    // Upload the new stamped PDF as a fresh asset (keeps the prior stamped
    // asset for audit; we don't delete from Sanity).
    const newStampedUrl = await uploadSignedPdfToSanity(
      stampedBuf,
      `${stampKey}-${record.clientName || 'client'}-restamped-${Date.now()}.pdf`,
    )
    if (!newStampedUrl) {
      return NextResponse.json({ error: 'Sanity upload failed for restamped PDF' }, { status: 500 })
    }

    // Patch the task: new stampedDocUrl + manualOverride audit. Keep
    // signedDocUrl mirroring stampedDocUrl as the rest of the codebase
    // expects (see SigningCard fallback chain).
    const now = new Date().toISOString()
    const updated: SigningTask = {
      ...target,
      stampedDocUrl: newStampedUrl,
      signedDocUrl: newStampedUrl,
      manualOverride: {
        kind: 'restamped',
        at: now,
        ...(target.stampedDocUrl ? { originalSignedDocUrl: target.stampedDocUrl } : {}),
      },
    }
    const newTasks = [...tasks]
    newTasks[idx] = updated
    await patch(record._id, { set: { signingTasks: newTasks } })

    // Update Summit הערות so the office sees the corrected link from the CRM.
    if (record.summitEntityId) {
      try {
        await addSignedDocRemarkToSummit(
          record.summitEntityId,
          `${getSignedDocLabel(stampKey)} — מיקום מותאם`,
          newStampedUrl,
        )
      } catch (summitErr) {
        // Non-fatal — log and continue. Office will still see new asset in OS.
        console.error('[restamp] Summit remark failed:',
          summitErr instanceof Error ? summitErr.message : String(summitErr))
      }
    }

    return NextResponse.json({
      ok: true,
      stampedDocUrl: newStampedUrl,
      previousStampedDocUrl: target.stampedDocUrl || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
