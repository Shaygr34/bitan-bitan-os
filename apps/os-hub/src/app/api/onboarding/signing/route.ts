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
import { persistSignedDoc, uploadSignedPdfToSanity, addSignedDocRemarkToSummit, getSignedDocLabel } from '@/lib/onboarding/signed-doc-storage'
import {
  notifySigningSent,
  notifySigningCompleted,
  notifyExternalDone,
  notifyStageAdvanced,
} from '@/lib/onboarding/email-notifier'

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


    // Pull optional fields used by external + manual + 2Sign branches
    const {
      pdfBase64,
      pdfUrl,
      formType: docFormType,
      officeSignerName,
      officeSignerEmail,
      isManualSign,
    } = body as {
      pdfBase64?: string
      pdfUrl?: string
      formType?: string
      officeSignerName?: string
      officeSignerEmail?: string
      isManualSign?: boolean
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

    // Handle external tasks (ב"ל מיוצגים — no 2Sign).
    // Optional pdfBase64/pdfUrl: scanned BTL approval print is uploaded to
    // Sanity + הערות so the external doc is also retrievable from OS + Summit.
    if (isExternal) {
      let externalSignedUrl: string | undefined
      if (pdfBuffer) {
        const url = await persistSignedDoc({
          buffer: pdfBuffer,
          filename: `${documentType}-${clientName}-signed.pdf`,
          documentType,
          summitEntityId,
        })
        if (url) externalSignedUrl = url
      }

      const externalTask: SigningTask = {
        taskGuid: `external-${documentType}-${Date.now()}`,
        twoSignClientId: 0,
        documentType,
        status: 'external-done',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        externalRef: externalRef || '',
        ...(externalSignedUrl ? { signedDocUrl: externalSignedUrl } : {}),
      }

      await patch(record._id, {
        set: { signingTasks: [...currentTasks, externalTask] },
      })

      notifyExternalDone({
        clientName,
        summitEntityId,
        documentType,
        signedDocUrl: externalSignedUrl,
      })

      return NextResponse.json({ ok: true, taskGuid: externalTask.taskGuid, signedDocUrl: externalSignedUrl }, { status: 201 })
    }

    // Manual office-paper override: 2Sign skipped (e.g. office printed + signed
    // on paper). Caller uploads the final signed PDF; we persist + mark signed.
    if (isManualSign) {
      if (!pdfBuffer) {
        return NextResponse.json({ error: 'pdfBase64 or pdfUrl required for manual sign' }, { status: 400 })
      }
      const url = await persistSignedDoc({
        buffer: pdfBuffer,
        filename: `${documentType}-${clientName}-signed.pdf`,
        documentType,
        summitEntityId,
      })

      const manualTask: SigningTask = {
        taskGuid: `manual-${documentType}-${Date.now()}`,
        twoSignClientId: 0,
        documentType,
        status: 'signed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        ...(url ? { signedDocUrl: url, stampedDocUrl: url } : {}),
      }

      await patch(record._id, {
        set: { signingTasks: [...currentTasks, manualTask] },
      })

      notifySigningCompleted({
        clientName,
        summitEntityId,
        documentType,
        signedDocUrl: url,
        source: 'manual',
      })

      return NextResponse.json({ ok: true, taskGuid: manualTask.taskGuid, signedDocUrl: url }, { status: 201 })
    }

    // 2Sign flow — need email + PDF buffer
    if (!clientEmail) {
      return NextResponse.json({ error: 'clientEmail is required for 2Sign tasks' }, { status: 400 })
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

    notifySigningSent({
      clientName,
      summitEntityId,
      documentType,
      clientEmail,
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
                        const stampedUrl = await uploadSignedPdfToSanity(
                          stamped,
                          `${updated.documentType}-${record.clientName || 'client'}-stamped.pdf`,
                        )
                        if (stampedUrl) {
                          updated.stampedDocUrl = stampedUrl
                          // Mirror to Summit הערות so the doc shows on the client card.
                          await addSignedDocRemarkToSummit(
                            summitEntityId,
                            getSignedDocLabel(updated.documentType),
                            stampedUrl,
                          )
                        }
                      }
                    } catch (stampErr) {
                      // Non-fatal — original signed doc remains usable; office can manually counter-sign as fallback
                      console.error('Auto-stamp failed:', stampErr)
                    }
                  }
                }
              } catch { /* non-fatal */ }

              // Single notification per signed transition. Prefer stamped URL when available.
              notifySigningCompleted({
                clientName: record.clientName || 'לקוח',
                summitEntityId,
                documentType: updated.documentType,
                signedDocUrl: updated.stampedDocUrl || updated.signedDocUrl,
                source: updated.stampedDocUrl ? 'auto-stamp' : '2sign',
              })
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
              notifyStageAdvanced({
                clientName: record.clientName,
                summitEntityId,
                toStage: targetStage,
                reason: allSigned ? 'כל החתימות הושלמו' : 'הלקוח חתם',
              })
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
 * PUT /api/onboarding/signing — attach a signed PDF to an existing task.
 * Used for: BTL מיוצגים post-completion upload, late paper-signed POA upload.
 * Body: { summitEntityId, documentType, pdfBase64 | pdfUrl }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { summitEntityId, documentType, pdfBase64, pdfUrl } = body as {
      summitEntityId: string
      documentType: string
      pdfBase64?: string
      pdfUrl?: string
    }

    if (!summitEntityId || !documentType) {
      return NextResponse.json({ error: 'summitEntityId and documentType required' }, { status: 400 })
    }

    let pdfBuffer: Buffer | undefined
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, 'base64')
    } else if (pdfUrl) {
      const r = await fetch(pdfUrl)
      if (r.ok) pdfBuffer = Buffer.from(await r.arrayBuffer())
    }
    if (!pdfBuffer) {
      return NextResponse.json({ error: 'pdfBase64 or pdfUrl required' }, { status: 400 })
    }

    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, signingTasks, clientName }`,
      { eid: summitEntityId }
    )
    const record = records?.[0]
    if (!record) return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 })

    const tasks: SigningTask[] = record.signingTasks || []
    const idx = tasks.findIndex(t => t.documentType === documentType)
    if (idx < 0) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const url = await persistSignedDoc({
      buffer: pdfBuffer,
      filename: `${documentType}-${record.clientName || 'client'}-signed.pdf`,
      documentType,
      summitEntityId,
    })
    if (!url) return NextResponse.json({ error: 'Sanity upload failed' }, { status: 500 })

    const updated = [...tasks]
    updated[idx] = { ...tasks[idx], signedDocUrl: url, completedAt: tasks[idx].completedAt || new Date().toISOString() }
    await patch(record._id, { set: { signingTasks: updated } })

    notifySigningCompleted({
      clientName: record.clientName || 'לקוח',
      summitEntityId,
      documentType,
      signedDocUrl: url,
      source: 'late-upload',
    })

    return NextResponse.json({ ok: true, signedDocUrl: url })
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
