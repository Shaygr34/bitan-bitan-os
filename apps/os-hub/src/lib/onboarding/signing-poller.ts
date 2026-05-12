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
 * Option C (May 12, 2026): the cron no longer auto-stamps. Newly-signed
 * tasks transition to 'awaiting-office-authorize' and fire a magic-link email
 * to Avi/Ron. The mechanical materialization (PDF fetch → stamp → Sanity →
 * Summit הערה → stage advance) runs from the authorize POST endpoint on a
 * human trigger. Legacy 'signed'-with-no-artifact records still self-heal
 * here for backwards compatibility with pre-Option-C ghost states.
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
import {
  notifySigningCompleted,
  notifyStageAdvanced,
  notifyAwaitingOfficeAuthorize,
} from '@/lib/onboarding/email-notifier'
import { SUMMIT_STATUS_IDS } from '@/lib/onboarding/types'

const TERMINAL_STATUSES = new Set(['declined', 'expired', 'external-done'])
const PDF_FETCH_RETRY_BUDGET = 5

/**
 * A 'signed' task is **terminal-ready** but only **terminal** once we have the
 * artifact (signedDocUrl or stampedDocUrl) AND have notified. Until then the
 * cron must keep polling to retry the artifact fetch. This is the invariant
 * that was missing pre-2026-05-12 and caused 4 records to ghost-complete.
 *
 * 'awaiting-office-authorize' is non-terminal too — it parks the task
 * waiting for a human click. The poller no longer re-polls 2Sign for these
 * (the client already signed), but isFullySettled() treats them the same as
 * any other in-flight status so callers like the cron GROQ + page poll get
 * a consistent answer.
 */
function isFullySettled(task: SigningTask): boolean {
  if (TERMINAL_STATUSES.has(task.status)) return true
  if (task.status === 'awaiting-office-authorize') return false
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
  newlyAwaitingAuthorize: number
  stageAdvancedTo?: number
}

/**
 * Pull the signed PDF, stamp it (if applicable), persist to Sanity + Summit,
 * fire the completion email, and auto-advance Summit stage on milestones.
 *
 * Runs on a HUMAN trigger (POST /api/onboarding/signing/authorize) under
 * Option C — NOT inside the cron path. The cron stops at the awaiting-
 * authorize transition.
 *
 * Idempotent at the task level: re-running with an already-materialized
 * artifact short-circuits before any side effects. The HTTP endpoint should
 * still gate on task.status to surface "alreadyApplied" cleanly to the UI.
 */
export async function materializeSignedArtifact(
  record: Pick<OnboardingRecord, '_id' | 'accountManager' | 'clientName' | 'summitEntityId' | 'signingTasks'>,
  taskGuid: string,
): Promise<{ ok: boolean; stampedDocUrl?: string; signedDocUrl?: string; error?: string }> {
  const tasks: SigningTask[] = record.signingTasks || []
  const targetIdx = tasks.findIndex((t) => t.taskGuid === taskGuid)
  if (targetIdx === -1) {
    return { ok: false, error: 'task not found on record' }
  }
  const target = tasks[targetIdx]
  const now = new Date().toISOString()
  const stampKey = target.formType || target.documentType

  // 1) Pull signed PDF
  let signedBuf: Buffer | null = null
  let signedSasUrl: string | null = null
  let pdfFetchError: string | null = null
  try {
    const signedDoc = await getSignedDocument(taskGuid, 0)
    if (!signedDoc.FileUrl) {
      pdfFetchError = '2Sign response had no SAS URL (Message / SignedTaskLinkBlob)'
    } else {
      signedSasUrl = signedDoc.FileUrl
      const pdfRes = await fetch(signedDoc.FileUrl)
      if (pdfRes.ok) {
        signedBuf = Buffer.from(await pdfRes.arrayBuffer())
      } else {
        pdfFetchError = `SAS URL download returned HTTP ${pdfRes.status}`
      }
    }
  } catch (pdfErr) {
    pdfFetchError = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
  }

  if (!signedBuf) {
    // Bump retry counter so ops can see the failure trail, but DON'T transition
    // back to 'signed' — task stays in 'awaiting-office-authorize' so the human
    // can retry the magic link.
    const updated: SigningTask = {
      ...target,
      pdfFetchAttempts: (target.pdfFetchAttempts || 0) + 1,
      pdfFetchLastError: pdfFetchError || 'unknown PDF fetch failure',
    }
    const next = [...tasks]
    next[targetIdx] = updated
    await patch(record._id, { set: { signingTasks: next } })
    console.error(
      '[materializeSignedArtifact] PDF fetch failed for',
      taskGuid,
      updated.pdfFetchLastError,
    )
    return { ok: false, error: updated.pdfFetchLastError }
  }

  // 2) Stamp + persist (mirrors the original poller flow)
  const updated: SigningTask = {
    ...target,
    status: 'signed',
    signedDocUrl: signedSasUrl || target.signedDocUrl,
    lastPolledAt: now,
    pdfFetchAttempts: undefined,
    pdfFetchLastError: undefined,
  }

  if (formNeedsAutoStamp(stampKey)) {
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
      const msg = stampErr instanceof Error ? stampErr.message : String(stampErr)
      console.error('[materializeSignedArtifact] auto-stamp failed:', msg)
      // Persist that we tried — task stays 'signed' with the raw signedDocUrl
      // (so the human at least sees the client-signed PDF). Caller decides
      // whether to surface this as an error.
      updated.pdfFetchLastError = `auto-stamp failed: ${msg}`
    }
  } else {
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
      const msg = persistErr instanceof Error ? persistErr.message : String(persistErr)
      console.error('[materializeSignedArtifact] persist failed:', msg)
      updated.pdfFetchLastError = `persist failed: ${msg}`
    }
  }

  // 3) Notify Avi/Ron — final "X חתם & אושר!" email (the original auto-stamp
  // email kept its semantics; the wording change is intentionally minimal so
  // Avi/Ron's existing inbox filters still match).
  const hasArtifact = Boolean(updated.stampedDocUrl || updated.signedDocUrl)
  if (hasArtifact && !target.notifiedAt && record.summitEntityId) {
    notifySigningCompleted({
      clientName: record.clientName || 'לקוח',
      summitEntityId: record.summitEntityId,
      documentType: updated.documentType,
      signedDocUrl: updated.stampedDocUrl || updated.signedDocUrl,
      source: updated.stampedDocUrl ? 'auto-stamp' : '2sign',
    })
    updated.notifiedAt = now
  }

  // 4) Persist task
  const nextTasks = [...tasks]
  nextTasks[targetIdx] = updated
  await patch(record._id, { set: { signingTasks: nextTasks } })

  // 5) Auto-advance Summit stage — now ALWAYS triggered post-authorization,
  // never from the cron path. Stage 3 once client signs are authorized,
  // stage 4 once all signatures (including externals) are in.
  if (record.summitEntityId) {
    const allSigned = nextTasks.every(
      (t) => t.status === 'signed' || t.status === 'external-done',
    )
    const clientTasks = nextTasks.filter((t) => !t.taskGuid.startsWith('external-'))
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
              reason: allSigned ? 'כל החתימות הושלמו' : 'הלקוח חתם ואושר על ידי המשרד',
            })
          }
        }
      } catch (err) {
        console.error(
          '[materializeSignedArtifact] stage advance failed:',
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  return {
    ok: true,
    stampedDocUrl: updated.stampedDocUrl,
    signedDocUrl: updated.signedDocUrl,
  }
}

/**
 * Poll all non-terminal signing tasks on a single record, persist transitions,
 * fire the authorize-gate email when a client newly signs, and self-heal legacy
 * 'signed'-with-no-artifact records.
 *
 * Idempotent: re-running on a record where everything is already terminal is
 * a no-op. Once a task moves to 'awaiting-office-authorize' the cron stops
 * touching it; the human magic-link click drives the rest of the pipeline.
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
    newlyAwaitingAuthorize: 0,
  }

  if (tasks.length === 0) return result

  const now = new Date().toISOString()
  let newlySigned = 0
  let newlyAwaitingAuthorize = 0
  const pendingMaterialize: string[] = []

  const updatedTasks = await Promise.all(
    tasks.map(async (task) => {
      if (isFullySettled(task)) return task
      // Awaiting-authorize is parked on a human click — cron does NOT re-poll
      // 2Sign for it and does NOT auto-materialize.
      if (task.status === 'awaiting-office-authorize') return task
      // Skip external/manual taskGuids — these have no 2Sign GUID to query
      if (task.taskGuid.startsWith('external-') || task.taskGuid.startsWith('manual-')) return task

      try {
        const detail = await getTask(task.taskGuid)
        const statusStr = (detail.Status || '').toLowerCase()

        let detected: SigningTask['status'] = task.status
        if (statusStr.includes('completed') || statusStr.includes('signed')) {
          detected = 'signed'
        } else if (statusStr.includes('declined') || statusStr.includes('rejected')) {
          detected = 'declined'
        } else if (statusStr.includes('expired')) {
          detected = 'expired'
        } else if (statusStr.includes('sent') || statusStr.includes('pending')) {
          detected = 'sent'
        }

        // Always bump lastPolledAt — audit trail in Sanity that the cron ran.
        const updated: SigningTask = { ...task, lastPolledAt: now }

        const isNewlySigned = detected === 'signed' && task.status !== 'signed'

        if (isNewlySigned) {
          // Option C transition: park at the authorize gate.
          // Do NOT pull the PDF, do NOT stamp, do NOT write a הערה, do NOT
          // advance the stage. The human magic-link click does all of that.
          updated.status = 'awaiting-office-authorize'
          updated.completedAt = detail.CompletedDate || now
          newlyAwaitingAuthorize++
          pendingMaterialize.push(task.taskGuid)
          return updated
        }

        // Legacy self-heal: a task already at status='signed' with no artifact
        // and a remaining retry budget belongs to the pre-Option-C ghost class.
        // Pull the PDF, stamp it, persist — same path the cron has always taken.
        const needsLegacyHeal =
          task.status === 'signed' &&
          !task.signedDocUrl &&
          !task.stampedDocUrl &&
          (task.pdfFetchAttempts || 0) < PDF_FETCH_RETRY_BUDGET

        if (needsLegacyHeal) {
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
            newlySigned++
          } else if (!hasArtifact) {
            updated.pdfFetchAttempts = (task.pdfFetchAttempts || 0) + 1
            updated.pdfFetchLastError = pdfFetchError || 'auto-stamp/persist produced no URL'
            console.warn(
              `[signing-poller] No artifact for signed task ${task.taskGuid} ` +
                `(attempt ${updated.pdfFetchAttempts}/${PDF_FETCH_RETRY_BUDGET}): ${updated.pdfFetchLastError}`,
            )
          }
          return updated
        }

        // Other transitions (declined / expired / sent / pending) just persist.
        if (detected !== task.status) {
          updated.status = detected
        }
        return updated
      } catch (err) {
        console.error('[signing-poller] getTask failed for', task.taskGuid, err instanceof Error ? err.message : err)
        return { ...task, lastPolledAt: now }
      }
    }),
  )

  result.anyUpdated = true
  result.newlySigned = newlySigned
  result.newlyAwaitingAuthorize = newlyAwaitingAuthorize
  result.tasks = updatedTasks

  await patch(record._id, { set: { signingTasks: updatedTasks } })

  // Fire authorize-gate emails AFTER persistence — so the magic link the user
  // clicks finds the task in 'awaiting-office-authorize' (race-free).
  if (newlyAwaitingAuthorize > 0 && record.summitEntityId) {
    for (const taskGuid of pendingMaterialize) {
      const newlyTask = updatedTasks.find((t) => t.taskGuid === taskGuid)
      if (!newlyTask) continue
      notifyAwaitingOfficeAuthorize({
        recordId: record._id,
        taskGuid,
        clientName: record.clientName || 'לקוח',
        summitEntityId: record.summitEntityId,
        documentType: newlyTask.documentType,
      })
    }
  }

  // Legacy stage-advance — only triggers on the self-heal path, where
  // newlySigned was bumped by an authorized artifact landing this cycle.
  // Option-C tasks advance from inside materializeSignedArtifact() instead.
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
