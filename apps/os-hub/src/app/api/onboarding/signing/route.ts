import { NextResponse } from 'next/server'
import { query, patch } from '@/lib/sanity/client'
import { initiateSigning, resendTask, ResendTaskError } from '@/lib/onboarding/twosign-client'
import type { OnboardingRecord, SigningTask } from '@/lib/onboarding/types'
import { formNeedsAutoStamp } from '@/lib/onboarding/auto-stamp'
import { persistSignedDoc } from '@/lib/onboarding/signed-doc-storage'
import {
  notifySigningSent,
  notifySigningCompleted,
  notifyExternalDone,
} from '@/lib/onboarding/email-notifier'
import { pollRecord } from '@/lib/onboarding/signing-poller'

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
      formType,
      status: 'sent',
      createdAt: new Date().toISOString(),
    }

    await patch(record._id, {
      set: { signingTasks: [...currentTasks, signingTask] },
    })

    // notifySigningSent dropped 2026-05-12 — the SigningCard status surface
    // already shows "נשלח" the moment the office clicks the button. The mail
    // was firing redundantly into bitan@bitancpa.com (4 emails per sign event
    // was too noisy — Resend quota at 80% confirmed the pressure).

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
 * Triggers a 2Sign refresh + auto-stamp + stage-advance via the shared poller.
 *
 * NOTE: this is page-presence-driven — only fires while someone has the detail
 * page open. The cron at /api/cron/signing-poll uses the same poller to
 * guarantee transitions land even when nobody's looking.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const summitEntityId = searchParams.get('summitEntityId')

  if (!summitEntityId) {
    return NextResponse.json({ error: 'summitEntityId required' }, { status: 400 })
  }

  try {
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ _id, signingTasks, accountManager, clientName, summitEntityId }`,
      { eid: summitEntityId }
    )
    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ tasks: [] })
    }

    const result = await pollRecord(record)
    const allSigned = result.tasks.length > 0 && result.tasks.every(
      (t) => t.status === 'signed' || t.status === 'external-done'
    )

    return NextResponse.json({ tasks: result.tasks, allSigned })
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
    // 2Sign tasks are immutable post-creation: if the office edited the client
    // email/phone in the OS after the task was sent, 2Sign's task→contact
    // linkage breaks and ResendTask returns 404. Surface a Hebrew message that
    // tells the office how to recover (re-upload the PDF + send a fresh task),
    // since v1 cannot auto-recreate (we don't store the original PDF).
    if (err instanceof ResendTaskError && err.code === 'TASK_NOT_FOUND') {
      return NextResponse.json(
        {
          error: 'הקישור פג תוקף או נמחק ב-2Sign — נא לשלוח מחדש מההתחלה (העלאת PDF חדש)',
          code: 'TASK_NOT_FOUND',
        },
        { status: 410 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
