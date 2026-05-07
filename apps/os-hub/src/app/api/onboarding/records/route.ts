import { NextRequest, NextResponse } from 'next/server'
import { query, createOrReplace, patch } from '@/lib/sanity/client'
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
        accountManager, intakeToken, startDate, checklistItems, notes,
        cachedStage, cachedUploadedDocs, cachedRequiredDocs, lastSyncedAt
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
 * DELETE /api/onboarding/records — delete an onboarding record (or legacy token) from Sanity.
 * Accepts { recordId } — handles both onboardingRecord and intakeToken doc IDs.
 *
 * Cascade behavior (fixes "deleted card reappears" bug):
 *   - Deleting an onboardingRecord also kills the matching intakeToken (by intakeToken field).
 *   - Deleting an intakeToken also kills the matching onboardingRecord (by intakeToken / summitEntityId).
 *   - Sanity drafts (drafts.{id}) are deleted alongside their published twin (Sanity does not auto-cascade drafts).
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { recordId } = body as { recordId?: string }

    if (!recordId) {
      return NextResponse.json({ error: 'recordId is required' }, { status: 400 })
    }

    const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId
    const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || 'production'
    const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken

    if (!projectId || !apiToken) {
      return NextResponse.json({ error: 'Sanity credentials not configured' }, { status: 500 })
    }

    // Build the set of doc IDs to delete (start with target + its draft)
    const idsToDelete = new Set<string>([recordId, `drafts.${recordId.replace(/^drafts\./, '')}`])

    // Discover related docs to cascade
    if (recordId.startsWith('intakeToken-')) {
      const tokenValue = recordId.replace('intakeToken-', '')
      const related = await query<Array<{ _id: string }>>(
        `*[_type == "onboardingRecord" && intakeToken == $t]{ _id }`,
        { t: tokenValue }
      )
      for (const r of related || []) {
        idsToDelete.add(r._id)
        idsToDelete.add(`drafts.${r._id.replace(/^drafts\./, '')}`)
      }
    } else {
      // recordId looks like an onboardingRecord — find its sibling intakeToken (if any)
      const rec = await query<Array<{ intakeToken?: string; summitEntityId?: string }>>(
        `*[_id == $id][0..0]{ intakeToken, summitEntityId }`,
        { id: recordId }
      )
      const tokenValue = rec?.[0]?.intakeToken
      if (tokenValue) {
        idsToDelete.add(`intakeToken-${tokenValue}`)
        idsToDelete.add(`drafts.intakeToken-${tokenValue}`)
      }
      const summitEntityId = rec?.[0]?.summitEntityId
      if (summitEntityId) {
        const tokensBySummit = await query<Array<{ _id: string }>>(
          `*[_type == "intakeToken" && summitEntityId == $s]{ _id }`,
          { s: summitEntityId }
        )
        for (const t of tokensBySummit || []) {
          idsToDelete.add(t._id)
          idsToDelete.add(`drafts.${t._id.replace(/^drafts\./, '')}`)
        }
      }
    }

    // Use delete-by-query (tolerates missing IDs — doesn't fail if a draft never existed)
    const mutations = [{
      delete: {
        query: '*[_id in $ids]',
        params: { ids: Array.from(idsToDelete) },
      },
    }]
    const url = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${dataset}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ mutations }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('Sanity delete failed:', res.status, text)
      return NextResponse.json({ error: `Delete failed: ${res.status}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deletedIds: Array.from(idsToDelete) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Delete error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/onboarding/records — link a record to its Summit entity.
 * Body: { recordId, summitEntityId }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { recordId, summitEntityId } = body as { recordId?: string; summitEntityId?: string }

    if (!recordId || !summitEntityId) {
      return NextResponse.json({ error: 'recordId and summitEntityId are required' }, { status: 400 })
    }

    await patch(recordId, { set: { summitEntityId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
