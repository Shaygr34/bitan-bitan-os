/**
 * Shared 2Sign polling + transition logic.
 *
 * Used by two callers:
 *   1. Page-presence poll  — apps/os-hub/src/app/api/onboarding/signing/route.ts GET
 *   2. Server-side cron    — apps/os-hub/src/app/api/cron/signing-poll/route.ts
 *
 * Why this exists: relying solely on the detail page being open meant signed
 * transitions never landed in Sanity for clients whose office staff closed the
 * page after sending. Cron now drives this independently of UI presence.
 *
 * Pure orchestration — no HTTP layer, no auth, no NextResponse. Caller does that.
 */
import { patch } from '@/lib/sanity/client'
import { getTask, getSignedDocument } from '@/lib/onboarding/twosign-client'
import type { OnboardingRecord, SigningTask } from '@/lib/onboarding/types'
import { applyOfficeStamp, formNeedsAutoStamp } from '@/lib/onboarding/auto-stamp'
import { resolveStampOwner } from '@/lib/onboarding/manager-stamps'
import {
  persistSignedDoc,
  uploadSignedPdfToSanity,
  addSignedDocRemarkToSummit,
  getSignedDocLabel,
} from '@/lib/onboarding/signed-doc-storage'
import { notifySigningCompleted, notifyStageAdvanced } from '@/lib/onboarding/email-notifier'
import { SUMMIT_STATUS_IDS } from '@/lib/onboarding/types'

const TERMINAL_STATUSES = new Set(['declined', 'expired', 'external-done'])
const PDF_FETCH_RETRY_BUDGET = 5

/**
 * A 'signed' task is **terminal-ready** but only **terminal** once we have the
 * artifact (signedDocUrl or stampedDocUrl) AND have notified. Until then the
 * cron must keep polling to retry the artifact fetch. This is the invariant
 * that was missing pre-2026-05-12 and caused 4 records to ghost-complete.
 */
function isFullySettled(task: SigningTask): boolean {
  if (TERMINAL_STATUSES.has(task.status)) return true
  if (task.status !== 'signed') return false
  const hasArtifact = Boolean(task.signedDocUrl || task.stampedDocUrl)
  const exhausted = (task.pdfFetchAttempts || 0) >= PDF_FETCH_RETRY_BUDGET
  return (hasArtifact && Boolean(task.notifiedAt)) || exhausted
}

export interface PollResult {
  recordId: string
  summitEntityId?: string
  tasks: SigningTask[]
  anyUpdated: boolean
  newlySigned: number
  stageAdvancedTo?: number
}

/**
 * Poll all non-terminal signing tasks on a single record, persist transitions,
 * fire notifications, and auto-advance Summit stage when applicable.
 *
 * Idempotent: re-running on a record where everything is already terminal is
 * a no-op (no Sanity write, no notification). Once a task transitions to
 * 'signed', notifiedAt is stamped — re-polling never re-fires the email.
 */
export async function pollRecord(
  record: Pick<OnboardingRecord, '_id' | 'signingTasks' | 'accountManager' | 'clientName' | 'summitEntityId'>,
): Promise<PollResult> {
  const tasks: SigningTask[] = record.signingTasks || []
  const result: PollResult = {
    recordId: record._id,
    summitEntityId: record.summitEntityId,
    tasks,
    anyUpdated: false,
    newlySigned: 0,
  }

  if (tasks.length === 0) return result

  const now = new Date().toISOString()
  let newlySigned = 0

  const updatedTasks = await Promise.all(
    tasks.map(async (task) => {
      // Fully settled = terminal status OR (signed + has artifact + notified) OR (signed + retry budget exhausted)
      if (isFullySettled(task)) return task
      // Skip external/manual taskGuids — these have no 2Sign GUID to query
      if (task.taskGuid.startsWith('external-') || task.taskGuid.startsWith('manual-')) return task

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

        // Always bump lastPolledAt — gives an audit trail in Sanity that the cron actually ran.
        const updated: SigningTask = { ...task, status: newStatus, lastPolledAt: now }

        const isNewlySigned = newStatus !== task.status && newStatus === 'signed'
        const needsArtifactRetry =
          newStatus === 'signed' &&
          !task.signedDocUrl &&
          !task.stampedDocUrl &&
          (task.pdfFetchAttempts || 0) < PDF_FETCH_RETRY_BUDGET

        if (isNewlySigned || needsArtifactRetry) {
          if (isNewlySigned) {
            updated.completedAt = detail.CompletedDate || now
            newlySigned++
          }

          // Pull signed PDF — surface failures, do NOT swallow.
          // Production code's prior `catch {}` here is what let 4 records ghost-complete
          // (status=signed, signedDocUrl=null, notifiedAt=stamped, never retried).
          let signedBuf: Buffer | null = null
          let pdfFetchError: string | null = null
          try {
            const signedDoc = await getSignedDocument(task.taskGuid, 0)
            if (!signedDoc.FileUrl) {
              pdfFetchError = '2Sign response had no SAS URL (Message / SignedTaskLinkBlob)'
            } else {
              const pdfRes = await fetch(signedDoc.FileUrl)
              if (pdfRes.ok) {
                signedBuf = Buffer.from(await pdfRes.arrayBuffer())
                updated.signedDocUrl = signedDoc.FileUrl
              } else {
                pdfFetchError = `SAS URL download returned HTTP ${pdfRes.status}`
              }
            }
          } catch (pdfErr) {
            pdfFetchError = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
            console.error('[signing-poller] getSignedDocument threw for', task.taskGuid, pdfFetchError)
          }

          // Form-key for auto-stamp routing: prefer persisted formType, fall back to documentType
          // (legacy tasks pre-formType-persistence still work if their documentType matches a stamp form).
          const stampKey = updated.formType || updated.documentType

          if (signedBuf && formNeedsAutoStamp(stampKey)) {
            try {
              const manager = resolveStampOwner(record.accountManager)
              const stamped = await applyOfficeStamp(signedBuf, {
                formType: stampKey,
                manager,
                alsoFillClientDate: true,
              })
              const stampedUrl = await uploadSignedPdfToSanity(
                stamped,
                `${stampKey}-${record.clientName || 'client'}-stamped.pdf`,
              )
              if (stampedUrl) {
                updated.stampedDocUrl = stampedUrl
                updated.signedDocUrl = stampedUrl
                if (record.summitEntityId) {
                  await addSignedDocRemarkToSummit(
                    record.summitEntityId,
                    getSignedDocLabel(stampKey),
                    stampedUrl,
                  )
                }
              }
            } catch (stampErr) {
              console.error('[signing-poller] Auto-stamp failed:', stampErr)
            }
          } else if (signedBuf) {
            // Non-stamp form (e.g. ב"ל ניכויים): mirror to Sanity + Summit הערות
            try {
              const persistedUrl = await persistSignedDoc({
                buffer: signedBuf,
                filename: `${stampKey}-${record.clientName || 'client'}-signed.pdf`,
                documentType: updated.documentType,
                summitEntityId: record.summitEntityId || '',
              })
              if (persistedUrl) updated.signedDocUrl = persistedUrl
            } catch (persistErr) {
              console.error('[signing-poller] Signed-doc persist failed:', persistErr)
            }
          }

          // Invariant: only fire notification + stamp notifiedAt when an artifact actually exists.
          // Without this gate, Avi/Ron get a "X חתם!" email pointing at nothing.
          const hasArtifact = Boolean(updated.stampedDocUrl || updated.signedDocUrl)
          if (hasArtifact && !task.notifiedAt && record.summitEntityId) {
            notifySigningCompleted({
              clientName: record.clientName || 'לקוח',
              summitEntityId: record.summitEntityId,
              documentType: updated.documentType,
              signedDocUrl: updated.stampedDocUrl || updated.signedDocUrl,
              source: updated.stampedDocUrl ? 'auto-stamp' : '2sign',
            })
            updated.notifiedAt = now
          } else if (!hasArtifact) {
            // No artifact this cycle — record the retry attempt for ops visibility.
            // The poller will try again next tick until budget is exhausted.
            updated.pdfFetchAttempts = (task.pdfFetchAttempts || 0) + 1
            updated.pdfFetchLastError = pdfFetchError || 'auto-stamp/persist produced no URL'
            console.warn(
              `[signing-poller] No artifact for signed task ${task.taskGuid} ` +
                `(attempt ${updated.pdfFetchAttempts}/${PDF_FETCH_RETRY_BUDGET}): ${updated.pdfFetchLastError}`,
            )
          }
        }

        return updated
      } catch (err) {
        // 2Sign API error — keep state, but still bump lastPolledAt so we know we tried.
        console.error('[signing-poller] getTask failed for', task.taskGuid, err instanceof Error ? err.message : err)
        return { ...task, lastPolledAt: now }
      }
    }),
  )

  // Did anything actually change beyond just lastPolledAt? lastPolledAt bumps every cycle —
  // we still patch every cycle so the audit field is accurate.
  result.anyUpdated = true
  result.newlySigned = newlySigned
  result.tasks = updatedTasks

  await patch(record._id, { set: { signingTasks: updatedTasks } })

  // Auto-advance Summit stage when signing milestones reached
  if (newlySigned > 0 && record.summitEntityId) {
    const allSigned = updatedTasks.every(
      (t) => t.status === 'signed' || t.status === 'external-done',
    )
    const clientTasks = updatedTasks.filter((t) => !t.taskGuid.startsWith('external-'))
    const clientSigned = clientTasks.length > 0 && clientTasks.every((t) => t.status === 'signed')

    if (clientSigned || allSigned) {
      const targetStage = allSigned ? 4 : 3
      try {
        const creds = {
          CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
          APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
        }
        if (creds.APIKey) {
          const statusId = SUMMIT_STATUS_IDS[targetStage]
          if (statusId) {
            await fetch('https://api.sumit.co.il/crm/data/updateentity/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
              body: JSON.stringify({
                Credentials: creds,
                Entity: {
                  ID: parseInt(record.summitEntityId, 10),
                  Folder: '557688522',
                  Properties: { Customers_Status: statusId },
                },
              }),
            })
            await patch(record._id, {
              set: { cachedStage: targetStage, lastSyncedAt: now },
            })
            notifyStageAdvanced({
              clientName: record.clientName,
              summitEntityId: record.summitEntityId,
              toStage: targetStage,
              reason: allSigned ? 'כל החתימות הושלמו' : 'הלקוח חתם',
            })
            result.stageAdvancedTo = targetStage
          }
        }
      } catch (err) {
        console.error('[signing-poller] Stage advance failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  return result
}
