/**
 * POST /api/onboarding/placement/apply
 *
 * Layer 1 commit: bakes the office-confirmed PlacementSpec onto the document
 * (office fields painted, client-signature markers injected for 2Sign),
 * persists the result, and FEEDS THE LEARNING LOOP (Layer 3) — every applied
 * spec teaches the suggester for next time.
 *
 * Body: { pdfUrl, formType, spec, summitEntityId?, documentType? }
 * Returns: { ok, placedPdfUrl, clientMarkers, painted, skipped }
 */

import { NextResponse } from 'next/server'
import { query } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'
import {
  applyPlacementSpec,
  type ApplyPlacementResult,
} from '@/lib/onboarding/placement-apply'
import { validatePlacementSpec, type PlacementSpec } from '@/lib/onboarding/placement-model'
import { placementStore } from '@/lib/onboarding/placement-store-instance'
import { resolveStampOwner } from '@/lib/onboarding/manager-stamps'
import {
  uploadSignedPdfToSanity,
  addSignedDocRemarkToSummit,
  getSignedDocLabel,
} from '@/lib/onboarding/signed-doc-storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Body {
  pdfUrl: string
  formType: string
  spec: PlacementSpec
  summitEntityId?: string
  documentType?: string
}

export async function POST(request: Request) {
  try {
    const { pdfUrl, formType, spec, summitEntityId, documentType } =
      (await request.json()) as Partial<Body>

    if (!pdfUrl || !formType || !spec) {
      return NextResponse.json(
        { error: 'pdfUrl, formType and spec are required' },
        { status: 400 },
      )
    }

    const errors = validatePlacementSpec(spec)
    if (errors.length) {
      return NextResponse.json({ error: errors.join(' '), code: 'INVALID_SPEC' }, { status: 422 })
    }

    // Resolve which manager autograph to paint for office fields.
    let accountManager: string | undefined
    let clientName: string | undefined
    if (summitEntityId) {
      const records = await query<Pick<OnboardingRecord, 'accountManager' | 'clientName'>[]>(
        `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ accountManager, clientName }`,
        { eid: summitEntityId },
      )
      accountManager = records?.[0]?.accountManager
      clientName = records?.[0]?.clientName
    }
    const manager = resolveStampOwner(accountManager)

    const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(25_000), cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch source PDF: HTTP ${res.status}` },
        { status: 502 },
      )
    }
    const pdfBuffer = Buffer.from(await res.arrayBuffer())

    let result: ApplyPlacementResult
    try {
      result = await applyPlacementSpec(pdfBuffer, spec, { manager })
    } catch (applyErr) {
      const msg = applyErr instanceof Error ? applyErr.message : String(applyErr)
      return NextResponse.json({ error: `Placement apply failed: ${msg}` }, { status: 500 })
    }

    const placedPdfUrl = await uploadSignedPdfToSanity(
      result.pdfBuffer,
      `${formType}-${clientName || 'doc'}-placed-${Date.now()}.pdf`,
    )
    if (!placedPdfUrl) {
      return NextResponse.json({ error: 'Sanity upload failed for placed PDF' }, { status: 500 })
    }

    // Layer 3 — record what the human applied so it trains the next suggestion.
    try {
      await placementStore.recordApplied({ ...spec, appliedAt: new Date().toISOString() })
    } catch (learnErr) {
      // Learning is best-effort — never fail the apply on a learn-write error.
      console.error('[placement/apply] learn record failed:',
        learnErr instanceof Error ? learnErr.message : String(learnErr))
    }

    // Surface the corrected document link in Summit הערות (non-fatal).
    if (summitEntityId) {
      try {
        await addSignedDocRemarkToSummit(
          summitEntityId,
          `${getSignedDocLabel(formType)} — מיקום ידני`,
          placedPdfUrl,
        )
      } catch (summitErr) {
        console.error('[placement/apply] Summit remark failed:',
          summitErr instanceof Error ? summitErr.message : String(summitErr))
      }
    }

    return NextResponse.json({
      ok: true,
      placedPdfUrl,
      clientMarkers: result.clientMarkers,
      painted: result.painted,
      skipped: result.skipped,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
