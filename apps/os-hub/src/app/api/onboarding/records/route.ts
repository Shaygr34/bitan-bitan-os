import { NextResponse } from 'next/server'
import { query, createOrReplace } from '@/lib/sanity/client'
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
