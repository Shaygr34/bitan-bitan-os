import { NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/onboarding/sync — cache Summit data into Sanity onboardingRecord.
 * Body: { summitEntityId, stage, uploadedDocs, requiredDocs }
 *
 * Called by the detail page after fetching live Summit data.
 * This keeps the dashboard's cached view fresh.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { summitEntityId, stage, uploadedDocs, requiredDocs } = body as {
      summitEntityId: string
      stage: number
      uploadedDocs: number
      requiredDocs: number
    }

    if (!summitEntityId) {
      return NextResponse.json({ error: 'summitEntityId required' }, { status: 400 })
    }

    // Find the record by summitEntityId
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id }`,
      { eid: summitEntityId }
    )

    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    await patch(record._id, {
      set: {
        cachedStage: stage ?? 0,
        cachedUploadedDocs: uploadedDocs ?? 0,
        cachedRequiredDocs: requiredDocs ?? 0,
        lastSyncedAt: new Date().toISOString(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
