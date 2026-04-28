import { NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'
import {
  initiateSigning,
  getTask,
  getSignedDocument,
  resendTask,
} from '@/lib/onboarding/twosign-client'
import type { OnboardingRecord, SigningTask } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/onboarding/signing — initiate a signing task for a client.
 * Body: { summitEntityId, clientName, clientEmail, clientPhone, documentType, templateId? }
 *
 * Creates a 2Sign task and stores the GUID in the onboardingRecord.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      summitEntityId,
      clientName,
      clientEmail,
      clientPhone,
      clientIdNumber,
      documentType,
      templateId,
      title,
    } = body as {
      summitEntityId: string
      clientName: string
      clientEmail: string
      clientPhone: string
      clientIdNumber?: string
      documentType: string
      templateId?: number
      title?: string
    }

    if (!summitEntityId || !clientName || !clientEmail || !documentType) {
      return NextResponse.json(
        { error: 'summitEntityId, clientName, clientEmail, and documentType are required' },
        { status: 400 }
      )
    }

    // Find the onboarding record
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, signingTasks }`,
      { eid: summitEntityId }
    )
    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 })
    }

    // Check if a task for this document type already exists and is active
    const existingTasks = record.signingTasks
    const existing = existingTasks?.find(
      t => t.documentType === documentType && (t.status === 'pending' || t.status === 'sent')
    )
    if (existing) {
      return NextResponse.json({
        error: 'signing task already exists for this document type',
        taskGuid: existing.taskGuid,
        status: existing.status,
      }, { status: 409 })
    }

    // Initiate signing via 2Sign
    const result = await initiateSigning({
      clientName,
      clientEmail,
      clientPhone,
      clientIdNumber,
      templateId,
      title: title || `ייפוי כוח — ${clientName}`,
      sendVia: { email: true, whatsapp: !!clientPhone },
    })

    // Store the signing task in the onboarding record
    const signingTask: SigningTask = {
      taskGuid: result.taskGuid,
      twoSignClientId: result.clientId,
      documentType,
      status: 'sent',
      createdAt: new Date().toISOString(),
    }

    const currentTasks: SigningTask[] = existingTasks || []
    await patch(record._id, {
      set: {
        signingTasks: [...currentTasks, signingTask],
      },
    })

    return NextResponse.json({
      ok: true,
      taskGuid: result.taskGuid,
      clientId: result.clientId,
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/onboarding/signing?summitEntityId=X — get signing status for all tasks.
 * Also refreshes status from 2Sign API and auto-advances stage if all signed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const summitEntityId = searchParams.get('summitEntityId')

  if (!summitEntityId) {
    return NextResponse.json({ error: 'summitEntityId required' }, { status: 400 })
  }

  try {
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, signingTasks }`,
      { eid: summitEntityId }
    )
    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ tasks: [] })
    }

    const tasks: SigningTask[] = record.signingTasks || []
    if (tasks.length === 0) {
      return NextResponse.json({ tasks: [] })
    }

    // Refresh status from 2Sign for non-terminal tasks
    let anyUpdated = false
    const updatedTasks = await Promise.all(
      tasks.map(async (task) => {
        if (task.status === 'signed' || task.status === 'declined' || task.status === 'expired') {
          return task // Terminal — skip API call
        }

        try {
          const detail = await getTask(task.taskGuid)
          const statusStr = (detail.Status || '').toLowerCase()

          let newStatus: SigningTask['status'] = task.status
          if (statusStr.includes('completed') || statusStr.includes('signed')) {
            newStatus = 'signed'
          } else if (statusStr.includes('declined') || statusStr.includes('rejected')) {
            newStatus = 'declined'
          } else if (statusStr.includes('expired')) {
            newStatus = 'expired'
          } else if (statusStr.includes('sent') || statusStr.includes('pending')) {
            newStatus = 'sent'
          }

          if (newStatus !== task.status) {
            anyUpdated = true
            const updated: SigningTask = { ...task, status: newStatus }
            if (newStatus === 'signed') {
              updated.completedAt = detail.CompletedDate || new Date().toISOString()
              // Try to get signed document URL
              try {
                const signedDoc = await getSignedDocument(task.taskGuid, 0)
                if (signedDoc.FileUrl) updated.signedDocUrl = signedDoc.FileUrl
              } catch { /* non-fatal */ }
            }
            return updated
          }
        } catch {
          // 2Sign API error — return existing state
        }
        return task
      })
    )

    // Persist updated statuses back to Sanity
    if (anyUpdated) {
      await patch(record._id, { set: { signingTasks: updatedTasks } })
    }

    // Check if all signing tasks are complete
    const allSigned = updatedTasks.length > 0 && updatedTasks.every(t => t.status === 'signed')

    return NextResponse.json({
      tasks: updatedTasks,
      allSigned,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/onboarding/signing — resend a signing notification.
 * Body: { taskGuid, via: { sms?, email?, whatsapp? } }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { taskGuid, via } = body as {
      taskGuid: string
      via?: { sms?: boolean; email?: boolean; whatsapp?: boolean }
    }

    if (!taskGuid) {
      return NextResponse.json({ error: 'taskGuid required' }, { status: 400 })
    }

    await resendTask(taskGuid, {
      phone: via?.sms,
      email: via?.email ?? true,
      whatsapp: via?.whatsapp,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
