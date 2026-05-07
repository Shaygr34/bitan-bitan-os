import { NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'
import {
  initiateSigning,
  getTask,
  getSignedDocument,
  resendTask,
} from '@/lib/onboarding/twosign-client'
import type { OnboardingRecord, SigningTask } from '@/lib/onboarding/types'
import { applyOfficeStamp, formNeedsAutoStamp } from '@/lib/onboarding/auto-stamp'
import { resolveStampOwner } from '@/lib/onboarding/manager-stamps'
import { sanityConfig } from '@/config/integrations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/onboarding/signing — initiate a signing task or mark external complete.
 *
 * For 2Sign tasks: { summitEntityId, clientName, clientEmail, clientPhone, documentType, templateId? }
 * For external tasks: { summitEntityId, clientName, documentType, isExternal: true, externalRef? }
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
      isExternal,
      externalRef,
    } = body as {
      summitEntityId: string
      clientName: string
      clientEmail?: string
      clientPhone?: string
      clientIdNumber?: string
      documentType: string
      templateId?: number
      title?: string
      isExternal?: boolean
      externalRef?: string
    }

    if (!summitEntityId || !clientName || !documentType) {
      return NextResponse.json(
        { error: 'summitEntityId, clientName, and documentType are required' },
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

    const currentTasks: SigningTask[] = record.signingTasks || []

    // Check if a task for this document type already exists and is active
    const existing = currentTasks.find(
      t => t.documentType === documentType &&
        !['signed', 'declined', 'expired', 'external-done'].includes(t.status)
    )
    if (existing) {
      return NextResponse.json({
        error: 'signing task already exists for this document type',
        taskGuid: existing.taskGuid,
        status: existing.status,
      }, { status: 409 })
    }

    // Handle external tasks (ב"ל מיוצגים — no 2Sign)
    if (isExternal) {
      const externalTask: SigningTask = {
        taskGuid: `external-${documentType}-${Date.now()}`,
        twoSignClientId: 0,
        documentType,
        status: 'external-done',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        externalRef: externalRef || '',
      }

      await patch(record._id, {
        set: { signingTasks: [...currentTasks, externalTask] },
      })

      return NextResponse.json({ ok: true, taskGuid: externalTask.taskGuid }, { status: 201 })
    }

    // 2Sign flow — need email + PDF buffer
    if (!clientEmail) {
      return NextResponse.json({ error: 'clientEmail is required for 2Sign tasks' }, { status: 400 })
    }

    // Get PDF buffer from request body (base64 encoded) or from a URL
    const { pdfBase64, pdfUrl, formType: docFormType, officeSignerName, officeSignerEmail } = body as {
      pdfBase64?: string
      pdfUrl?: string
      formType?: string
      officeSignerName?: string
      officeSignerEmail?: string
    }

    let pdfBuffer: Buffer | undefined
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, 'base64')
    } else if (pdfUrl) {
      const pdfRes = await fetch(pdfUrl)
      if (pdfRes.ok) {
        pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json({ error: 'pdfBase64 or pdfUrl is required for 2Sign tasks' }, { status: 400 })
    }

    // Map document type to form type for marker positions
    const formType = docFormType || (documentType === 'poa-tax-authority' ? 'poa-tax-authority' : 'poa-nii-withholdings')

    // Office counter-signature: forms that the backend can auto-stamp no longer
    // need a 2Sign routine task — we apply the office stamp + date in the GET
    // poll once the client signs. This collapses a 2-signer routine into a 1-signer
    // flow (client only) and removes the manual "Avi/Ron log into 2Sign" step.
    const officeSigner = (!formNeedsAutoStamp(formType) && formType === 'poa-tax-authority' && officeSignerEmail)
      ? { name: officeSignerName || 'ביטן את ביטן', email: officeSignerEmail }
      : undefined

    // Initiate signing via 2Sign with PDF marker approach
    const result = await initiateSigning({
      clientName,
      clientEmail,
      clientPhone: clientPhone || '',
      pdfBuffer,
      pdfFilename: `${documentType}-${clientName}.pdf`,
      formType,
      title: title || `ייפוי כוח — ${clientName}`,
      officeSigner,
    })

    const signingTask: SigningTask = {
      taskGuid: result.clientTaskGuid,
      twoSignClientId: result.clientId,
      documentType,
      status: 'sent',
      createdAt: new Date().toISOString(),
    }

    await patch(record._id, {
      set: { signingTasks: [...currentTasks, signingTask] },
    })

    return NextResponse.json({
      ok: true,
      taskGuid: result.clientTaskGuid,
      officeTaskGuid: result.officeTaskGuid,
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
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, signingTasks, accountManager, clientName }`,
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
                if (signedDoc.FileUrl) {
                  updated.signedDocUrl = signedDoc.FileUrl
                  // Auto-stamp pipeline: replaces the office counter-sign 2Sign routine.
                  // Fetch the signed PDF, embed Avi/Ron's autograph + dates, upload to Sanity.
                  if (formNeedsAutoStamp(updated.documentType)) {
                    try {
                      const pdfRes = await fetch(signedDoc.FileUrl)
                      if (pdfRes.ok) {
                        const signedBuf = Buffer.from(await pdfRes.arrayBuffer())
                        const manager = resolveStampOwner(record.accountManager)
                        const stamped = await applyOfficeStamp(signedBuf, {
                          formType: updated.documentType,
                          manager,
                          alsoFillClientDate: true,
                        })
                        const stampedUrl = await uploadStampedPdf(stamped, `${updated.documentType}-${record.clientName || 'client'}-stamped.pdf`)
                        if (stampedUrl) updated.stampedDocUrl = stampedUrl
                      }
                    } catch (stampErr) {
                      // Non-fatal — original signed doc remains usable; office can manually counter-sign as fallback
                      console.error('Auto-stamp failed:', stampErr)
                    }
                  }
                }
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
    const allSigned = updatedTasks.length > 0 && updatedTasks.every(
      t => t.status === 'signed' || t.status === 'external-done'
    )

    // Auto-advance stage when signing milestones are reached
    if (anyUpdated && summitEntityId) {
      const clientTasks = updatedTasks.filter(t => !t.taskGuid.startsWith('external-'))
      const clientSigned = clientTasks.length > 0 && clientTasks.every(t => t.status === 'signed')

      if (clientSigned || allSigned) {
        // Determine target stage: client signed → stage 3 (אישור מנהל), all signed → stage 4 (רשויות)
        const targetStage = allSigned ? 4 : 3
        try {
          const creds = {
            CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
            APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
          }
          if (creds.APIKey) {
            const { SUMMIT_STATUS_IDS } = await import('@/lib/onboarding/types')
            const statusId = SUMMIT_STATUS_IDS[targetStage]
            if (statusId) {
              await fetch('https://api.sumit.co.il/crm/data/updateentity/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
                body: JSON.stringify({
                  Credentials: creds,
                  Entity: { ID: parseInt(summitEntityId, 10), Folder: '557688522', Properties: { Customers_Status: statusId } },
                }),
              })
              // Sync cache
              await patch(record._id, { set: { cachedStage: targetStage, lastSyncedAt: new Date().toISOString() } })
            }
          }
        } catch { /* non-fatal — manual advance still available */ }
      }
    }

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
 * Upload a stamped PDF buffer to Sanity assets and return the CDN URL.
 * Returns null if Sanity creds are missing — caller treats stamping as non-fatal.
 */
async function uploadStampedPdf(buffer: Buffer, filename: string): Promise<string | null> {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || sanityConfig.projectId
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || sanityConfig.dataset || 'production'
  const apiToken = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN || sanityConfig.apiToken
  if (!projectId || !apiToken) return null

  const url = `https://${projectId}.api.sanity.io/v2024-01-01/assets/files/${dataset}?filename=${encodeURIComponent(filename)}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/pdf',
    },
    body: new Uint8Array(buffer),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error('Sanity asset upload failed:', resp.status, text.slice(0, 200))
    return null
  }
  const data = await resp.json() as { document?: { url?: string } }
  return data.document?.url || null
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
