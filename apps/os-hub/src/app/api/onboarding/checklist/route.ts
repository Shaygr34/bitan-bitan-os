import { NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'
import type { OnboardingRecord } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * PATCH /api/onboarding/checklist — toggle a checklist item.
 * Body: { recordId, itemKey, completed }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { recordId, itemKey, completed } = body as {
      recordId: string
      itemKey: string
      completed: boolean
    }

    if (!recordId || !itemKey || typeof completed !== 'boolean') {
      return NextResponse.json(
        { error: 'recordId, itemKey (string), and completed (boolean) are required' },
        { status: 400 },
      )
    }

    // Fetch the record to find the item index
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && _id == $id][0...1]`,
      { id: recordId },
    )

    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const itemIndex = record.checklistItems?.findIndex((i) => i._key === itemKey)
    if (itemIndex === undefined || itemIndex < 0) {
      return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })
    }

    const setOps: Record<string, unknown> = {
      [`checklistItems[${itemIndex}].completed`]: completed,
    }

    if (completed) {
      setOps[`checklistItems[${itemIndex}].completedAt`] = new Date().toISOString()
    }

    const unsetOps: string[] = []
    if (!completed) {
      unsetOps.push(`checklistItems[${itemIndex}].completedAt`)
    }

    await patch(recordId, {
      set: setOps,
      ...(unsetOps.length > 0 ? { unset: unsetOps } : {}),
    })

    return NextResponse.json({ success: true, itemKey, completed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
