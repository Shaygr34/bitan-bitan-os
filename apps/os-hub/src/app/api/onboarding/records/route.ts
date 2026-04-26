import { NextRequest, NextResponse } from 'next/server'
import { query, createOrReplace } from '@/lib/sanity/client'
import { sanityConfig } from '@/config/integrations'
import { buildChecklist } from '@/lib/onboarding/checklist-templates'
import type { OnboardingRecord } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/onboarding/records — list all onboarding records from Sanity.
 */
export async function GET() {
  try {
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord"] | order(_createdAt desc) {
        _id, _createdAt, summitEntityId, clientName, clientType,
        accountManager, intakeToken, startDate, checklistItems, notes
      }`
    )
    return NextResponse.json({ records })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/onboarding/records — create a new onboarding record.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { clientName, clientType, accountManager, intakeToken, summitEntityId, onboardingPath } = body as {
      clientName: string
      clientType?: string
      accountManager?: string
      intakeToken?: string
      summitEntityId?: string
      onboardingPath?: string
    }

    if (!clientName) {
      return NextResponse.json({ error: 'clientName is required' }, { status: 400 })
    }

    // Prevent duplicates: check if record already exists for this summitEntityId
    if (summitEntityId) {
      const existing = await query<OnboardingRecord[]>(
        `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, _createdAt, summitEntityId, clientName, clientType, accountManager, intakeToken, startDate, checklistItems, notes }`,
        { eid: summitEntityId }
      )
      if (existing && existing.length > 0) {
        return NextResponse.json({ record: existing[0] }, { status: 200 })
      }
    }

    const isTransfer = onboardingPath === 'transfer'
    const checklistItems = buildChecklist(clientType, isTransfer)
    const id = `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const doc = {
      _id: id,
      _type: 'onboardingRecord',
      clientName,
      clientType: clientType || '',
      accountManager: accountManager || '',
      intakeToken: intakeToken || '',
      summitEntityId: summitEntityId || '',
      startDate: new Date().toISOString(),
      checklistItems,
      notes: '',
    }

    const result = await createOrReplace(doc)
    return NextResponse.json({ record: { ...doc, _id: result._id } }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/onboarding/records — delete an onboarding record from Sanity.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { recordId } = body as { recordId?: string }

    if (!recordId) {
      return NextResponse.json({ error: 'recordId is required' }, { status: 400 })
    }

    const { projectId, dataset, apiToken } = sanityConfig

    if (!projectId || !apiToken) {
      return NextResponse.json({ error: 'Sanity credentials not configured' }, { status: 500 })
    }

    const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        mutations: [{ delete: { id: recordId } }],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `Sanity delete failed: ${res.status} ${text}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
