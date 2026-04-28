import { NextRequest, NextResponse } from 'next/server'
import { SUMMIT_STATUS_IDS } from '@/lib/onboarding/types'
import { query, patch } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE_URL = 'https://api.sumit.co.il'

function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
}

/**
 * POST /api/onboarding/advance — advance a Summit entity to the next onboarding stage.
 * Body: { entityId: string, targetStage: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { entityId, targetStage } = body as { entityId?: string; targetStage?: number }

    if (!entityId || !targetStage) {
      return NextResponse.json({ error: 'entityId and targetStage are required' }, { status: 400 })
    }

    if (targetStage < 1 || targetStage > 6) {
      return NextResponse.json({ error: 'targetStage must be between 1 and 6' }, { status: 400 })
    }

    const statusId = SUMMIT_STATUS_IDS[targetStage]
    if (!statusId) {
      return NextResponse.json({ error: `No Summit status ID for stage ${targetStage}` }, { status: 400 })
    }

    const creds = getCredentials()
    if (!creds.APIKey) {
      return NextResponse.json({ error: 'Summit API credentials not configured' }, { status: 500 })
    }

    const res = await fetch(`${BASE_URL}/crm/data/updateentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        EntityID: parseInt(entityId, 10),
        Folder: '557688522',
        Fields: {
          Customers_Status: statusId,
        },
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `Summit API error: ${res.status} ${text}` }, { status: 500 })
    }

    const json = await res.json()
    if (json.Status !== 0) {
      return NextResponse.json({ error: `Summit error: ${json.UserErrorMessage || json.TechnicalErrorDetails || 'Unknown'}` }, { status: 500 })
    }

    // Sync stage cache to Sanity
    try {
      const records = await query<OnboardingRecord[]>(
        `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id }`,
        { eid: entityId }
      )
      if (records?.[0]) {
        await patch(records[0]._id, {
          set: {
            cachedStage: targetStage,
            lastSyncedAt: new Date().toISOString(),
          },
        })
      }
    } catch {
      // Non-fatal: cache sync failure doesn't block advance
    }

    return NextResponse.json({ ok: true, targetStage })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
