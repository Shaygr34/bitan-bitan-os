/**
 * POST /api/onboarding/placement/suggest
 *
 * Layer 2 endpoint: returns a PlacementSpec for a document — the suggester's
 * proposal, with any learned corrections (Layer 3) already merged in. The
 * mini-app renders this as the starting point the office confirms/adjusts.
 *
 * Never a hard failure: unresolved anchors come back as `unresolved` fields
 * for manual placement, not an error.
 *
 * Body: { pdfUrl, formType, summitEntityId?, documentType? }
 */

import { NextResponse } from 'next/server'
import { suggestPlacements } from '@/lib/onboarding/placement-suggester'
import { mergeLearned } from '@/lib/onboarding/placement-store'
import { placementStore } from '@/lib/onboarding/placement-store-instance'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Body {
  pdfUrl: string
  formType: string
  summitEntityId?: string
  documentType?: string
}

export async function POST(request: Request) {
  try {
    const { pdfUrl, formType, summitEntityId, documentType } =
      (await request.json()) as Partial<Body>

    if (!pdfUrl || !formType) {
      return NextResponse.json({ error: 'pdfUrl and formType are required' }, { status: 400 })
    }

    const res = await fetch(pdfUrl)
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch source PDF: HTTP ${res.status}` },
        { status: 502 },
      )
    }
    const pdfBuffer = Buffer.from(await res.arrayBuffer())

    const suggestion = await suggestPlacements(pdfBuffer, formType, {
      summitEntityId,
      documentType,
    })
    const learned = await placementStore.getLearned(formType)
    const spec = mergeLearned(suggestion, learned)

    return NextResponse.json({ ok: true, spec })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
