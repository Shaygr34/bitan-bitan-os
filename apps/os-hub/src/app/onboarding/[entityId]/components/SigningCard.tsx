'use client'

import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { resolveOfficeSigner, type SigningTask } from '@/lib/onboarding/types'
import { FORM_LAYOUTS } from '@/lib/onboarding/form-layouts'
import { getBtlMiyutzagimMessage, buildWhatsAppUrl } from '@/lib/onboarding/letter-templates'
import styles from './SigningCard.module.css'

// react-pdf brings in pdfjs + worker setup that should only load when the
// office actually opens the click-to-place modal. Dynamic import + ssr:false
// keeps the SigningCard bundle slim and avoids server-side pdfjs issues.
const RestampModal = dynamic(() => import('./RestampModal'), { ssr: false })
const AuthorizeModal = dynamic(() => import('./AuthorizeModal'), { ssr: false })
// Universal manual placement mini-app (Layer 1, the spine). Same dynamic +
// ssr:false reason as RestampModal — react-pdf/pdfjs only loads on open.
const PlacementStudio = dynamic(() => import('./PlacementStudio'), { ssr: false })

interface Props {
  summitEntityId: string
  recordId?: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientIdNumber?: string
  clientType?: string
  accountManager?: string
  currentStage: number
  tasks: SigningTask[]
  onTasksChanged: () => void
}

const STATUS_LABELS: Record<string, string> = {
  'not-started': 'טרם הופק',
  pending: 'הופק — ממתין להעלאה',
  sent: 'נשלח — ממתין לחתימת לקוח',
  'awaiting-counter': 'לקוח חתם — ממתין לחתימת מנהל',
  'awaiting-office-authorize': 'לקוח חתם — ממתין לאישור משרד',
  signed: 'נחתם',
  declined: 'סורב',
  expired: 'פג תוקף',
  'external-sent': 'קישור נשלח — ממתין ללקוח',
  'external-done': 'הושלם',
}

const STATUS_ICONS: Record<string, string> = {
  'not-started': '\u25CB',
  pending: '\u23F3',
  sent: '\u2709',
  'awaiting-counter': '\u270D',
  'awaiting-office-authorize': '\u23F1',
  signed: '\u2714',
  declined: '\u2718',
  expired: '\u26A0',
  'external-sent': '\u2197',
  'external-done': '\u2714',
}

interface SigningDocType {
  documentType: string
  label: string
  description: string
  method: 'twosign' | 'external'
  requiresCounterSign: boolean
  clientTypeFilter: string[] | null
  formType: string
}

const ALL_SIGNING_DOCS: SigningDocType[] = [
  {
    documentType: 'poa-tax-authority',
    label: 'ייפוי כוח רשות המיסים',
    description: 'מ"ה / מע"מ / ניכויים — חתימת לקוח + מנהל תיק',
    method: 'twosign',
    requiresCounterSign: true,
    clientTypeFilter: null,
    formType: 'poa-tax-authority',
  },
  {
    documentType: 'poa-nii-withholdings',
    label: 'ייפוי כוח ב"ל ניכויים',
    description: 'למעסיקים — חתימת מעסיק בלבד',
    method: 'twosign',
    requiresCounterSign: false,
    clientTypeFilter: ['חברה', 'חברה בע"מ', 'שותפות', 'עמותה'],
    formType: 'poa-nii-withholdings',
  },
  {
    documentType: 'poa-nii-representatives',
    label: 'ייפוי כוח ב"ל מיוצגים',
    description: 'קישור מביטוח לאומי — הלקוח ממלא ומאשר באתר ב"ל',
    method: 'external',
    requiresCounterSign: false,
    clientTypeFilter: null,
    formType: '',
  },
]

export default function SigningCard({
  summitEntityId,
  recordId,
  clientName,
  clientEmail,
  clientPhone,
  clientIdNumber,
  clientType,
  accountManager,
  currentStage,
  tasks,
  onTasksChanged,
}: Props) {
  const [sending, setSending] = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [externalRef, setExternalRef] = useState<Record<string, string>>({})
  const [externalLink, setExternalLink] = useState<Record<string, string>>({})
  /** documentType currently open in the click-to-place restamp modal (Path B). */
  const [restampOpenFor, setRestampOpenFor] = useState<string | null>(null)
  /** documentType currently open in the universal PlacementStudio (suggest + manual + learn). */
  const [placementOpenFor, setPlacementOpenFor] = useState<string | null>(null)
  /** Authorize-flow modal state: minted JWT token to render inside the modal. */
  const [authorizeModalToken, setAuthorizeModalToken] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const manualFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const externalDoneFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const relevantDocs = ALL_SIGNING_DOCS.filter(doc => {
    if (!doc.clientTypeFilter) return true
    return doc.clientTypeFilter.includes(clientType || '')
  })

  /** Upload PDF and send for signing via 2Sign */
  const handleFileSelected = useCallback(async (documentType: string, file: File) => {
    setSending(documentType)
    setError(null)

    try {
      // Read file as base64
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )

      const doc = ALL_SIGNING_DOCS.find(d => d.documentType === documentType)

      // Resolve office counter-signer based on client's case manager (מנהל תיק)
      const officeSigner = doc?.requiresCounterSign ? resolveOfficeSigner(accountManager) : null

      const res = await fetch('/api/onboarding/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          clientName,
          clientEmail,
          clientPhone,
          clientIdNumber,
          documentType,
          pdfBase64: base64,
          formType: doc?.formType,
          officeSignerEmail: officeSigner?.email,
          officeSignerName: officeSigner?.name,
          // Always supersede an existing task for this docType when the office
          // initiates a fresh send. Covers two cases the UI surfaces this from:
          //   1. Initial send (no existing task) — supersede is a no-op.
          //   2. Restart from declined/expired/signed (terminal task exists) —
          //      replaces the old record in place instead of accumulating
          //      stale entries in signingTasks[].
          supersedeExisting: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        if (res.status === 409) {
          onTasksChanged()
          return
        }
        throw new Error(data.error || `שגיאה: ${res.status}`)
      }

      onTasksChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחה')
    } finally {
      setSending(null)
      // Reset file input
      const input = fileInputRefs.current[documentType]
      if (input) input.value = ''
    }
  }, [summitEntityId, clientName, clientEmail, clientPhone, clientIdNumber, accountManager, onTasksChanged])

  /** In-app authorize for tasks at the office-authorize gate (Option C). */
  /**
   * Office-side authorize: mints the JWT token then OPENS the AuthorizeModal
   * (was: immediately POST to authorize). The modal renders the same
   * AuthorizeFlow used by the email link — preview the signed doc, optional
   * approval note, deliberate confirm. Unified UX across surfaces per Shay
   * 2026-05-14 feedback ("not one click... avi + ron need to see the signed
   * customer doc, then approve with a message").
   */
  const handleAuthorize = useCallback(async (taskGuid: string) => {
    if (!recordId) {
      setError('חסר מזהה רשומה לאישור — רענן את הדף ונסה שוב')
      return
    }
    setAuthorizing(taskGuid)
    setError(null)
    try {
      const mintRes = await fetch('/api/onboarding/signing/authorize/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, taskGuid }),
      })
      const mintData = await mintRes.json().catch(() => ({})) as { token?: string; error?: string }
      if (!mintRes.ok || !mintData.token) {
        throw new Error(mintData.error || 'לא ניתן להפיק טוקן אישור')
      }
      // Open the modal with the minted token — the modal handles preview +
      // confirm + actual authorize POST internally.
      setAuthorizeModalToken(mintData.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה באישור')
    } finally {
      setAuthorizing(null)
    }
  }, [recordId])

  const handleResend = useCallback(async (taskGuid: string) => {
    setResending(taskGuid)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/signing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskGuid,
          via: { email: true, whatsapp: !!clientPhone },
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        throw new Error(data.error || 'שגיאה בשליחה חוזרת')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setResending(null)
    }
  }, [clientPhone])

  /**
   * Manual mark-done with optional signed PDF (office-paper override for 2Sign forms).
   *
   * Path A of the office manual-overtake flow (Path B = coord override + re-stamp
   * lands in a follow-up PR). Used in three situations:
   *   1. No task yet — office bypasses 2Sign entirely, uploads a pre-signed PDF.
   *   2. In-flight 2Sign task that's stuck (client never signed, sent on paper
   *      instead) — office uploads the pre-signed PDF; backend supersedes the
   *      stuck task in place, preserving audit trail.
   *   3. Already-signed task whose stamped output is wrong — office replaces the
   *      stored PDF with a corrected one (re-stamped externally or scanned).
   * The supersedeExisting flag tells the backend whether a confirmed override
   * was intended; without it the backend 409s on duplicate documentType.
   */
  const handleManualSign = useCallback(async (
    documentType: string,
    file: File,
    existingTask?: SigningTask | null,
  ) => {
    if (existingTask) {
      const statusLabel = STATUS_LABELS[existingTask.status] || existingTask.status
      const ok = window.confirm(
        `קיימת משימה (${statusLabel}) עבור מסמך זה. ` +
        `העלאת PDF חתום תחליף את המשימה הקיימת — להמשיך?`,
      )
      if (!ok) return
    }
    setSending(documentType)
    setError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )
      const res = await fetch('/api/onboarding/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          clientName,
          clientEmail: clientEmail || '',
          clientPhone: clientPhone || '',
          documentType,
          isManualSign: true,
          supersedeExisting: !!existingTask,
          pdfBase64: base64,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        throw new Error(data.error || 'שגיאה')
      }
      onTasksChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSending(null)
      const input = manualFileRefs.current[documentType]
      if (input) input.value = ''
    }
  }, [summitEntityId, clientName, clientEmail, clientPhone, onTasksChanged])

  /** Attach a signed PDF to an already-completed external task (BTL מיוצגים). */
  const handleExternalDocUpload = useCallback(async (documentType: string, file: File) => {
    setSending(documentType)
    setError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )
      const res = await fetch('/api/onboarding/signing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          documentType,
          pdfBase64: base64,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        throw new Error(data.error || 'שגיאה')
      }
      onTasksChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSending(null)
      const input = externalDoneFileRefs.current[documentType]
      if (input) input.value = ''
    }
  }, [summitEntityId, onTasksChanged])

  /** Phase 1: open WhatsApp with drafted BTL מיוצגים message + pasted link. */
  const handleSendBtlLink = useCallback((documentType: string) => {
    const link = (externalLink[documentType] || '').trim()
    if (!link) return
    const text = getBtlMiyutzagimMessage(clientName, link)
    window.open(buildWhatsAppUrl(text, clientPhone), '_blank')
  }, [externalLink, clientName, clientPhone])

  const handleMarkExternalDone = useCallback(async (documentType: string) => {
    setSending(documentType)
    setError(null)

    try {
      const ref = externalRef[documentType] || ''
      const res = await fetch('/api/onboarding/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          clientName,
          clientEmail: '',
          clientPhone: '',
          documentType,
          isExternal: true,
          externalRef: ref,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        throw new Error(data.error || 'שגיאה')
      }

      onTasksChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSending(null)
    }
  }, [summitEntityId, clientName, clientEmail, externalRef, onTasksChanged])

  if (currentStage < 1 && tasks.length === 0) return null

  const completedCount = relevantDocs.filter(doc => {
    const task = tasks.find(t => t.documentType === doc.documentType)
    return task?.status === 'signed' || task?.status === 'external-done'
  }).length
  const totalRequired = relevantDocs.length

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{'ייפוי כוח — חתימות'}</h3>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={async () => {
              setRefreshing(true)
              try {
                await onTasksChanged()
              } finally {
                setRefreshing(false)
              }
            }}
            disabled={refreshing}
            title="רענן סטטוס מ-2Sign"
          >
            {refreshing ? '...' : '\u21BB רענן'}
          </button>
          <span className={styles.count}>
            {completedCount}/{totalRequired}
          </span>
        </div>
      </div>

      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: totalRequired > 0 ? `${(completedCount / totalRequired) * 100}%` : '0%' }}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.taskList}>
        {relevantDocs.map((doc) => {
          const task = tasks.find(t => t.documentType === doc.documentType)
          const status = task?.status || 'not-started'
          const icon = STATUS_ICONS[status] || ''
          const statusLabel = STATUS_LABELS[status] || status
          const isComplete = status === 'signed' || status === 'external-done'

          return (
            <div key={doc.documentType} className={`${styles.taskRow} ${isComplete ? styles.status_signed : ''} ${status === 'declined' || status === 'expired' ? styles.status_declined : ''} ${status === 'awaiting-office-authorize' ? styles.status_awaitingAuthorize : ''} ${status === 'sent' || status === 'pending' ? styles.status_sent : ''}`}>
              <div className={styles.taskInfo}>
                <span className={styles.taskIcon}>{icon}</span>
                <div className={styles.taskLabels}>
                  <span className={styles.taskLabel}>{doc.label}</span>
                  <span className={styles.taskDescription}>{doc.description}</span>
                  <span className={styles.taskStatus}>
                    {statusLabel}
                    {(status === 'sent' || status === 'pending') && (
                      <span className={styles.inFlightBadge} style={{ marginInlineStart: 8 }}>
                        {'ממתין לחתימת לקוח'}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className={styles.taskActions}>
                {doc.method === 'twosign' && (
                  <>
                    {!task && (
                      <>
                        <input
                          ref={el => { fileInputRefs.current[doc.documentType] = el }}
                          type="file"
                          accept=".pdf"
                          className={styles.fileInput}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileSelected(doc.documentType, file)
                          }}
                        />
                        <div className={styles.sendBtnWrap}>
                          <button
                            className={styles.sendBtn}
                            onClick={() => fileInputRefs.current[doc.documentType]?.click()}
                            disabled={sending === doc.documentType || !clientEmail}
                            title={!clientEmail ? 'חסר אימייל לקוח' : 'העלה PDF ושלח לחתימה'}
                            type="button"
                          >
                            {sending === doc.documentType ? '⏳ שולח ל-2Sign…' : 'העלה PDF ושלח'}
                          </button>
                          {sending === doc.documentType && (
                            <div className={styles.sendProgress} aria-label="שולח" />
                          )}
                        </div>
                      </>
                    )}

                    {task && (status === 'sent' || status === 'pending') && (
                      <>
                        <button
                          className={styles.resendBtn}
                          onClick={() => handleResend(task.taskGuid)}
                          disabled={resending === task.taskGuid}
                          type="button"
                        >
                          {resending === task.taskGuid ? 'שולח...' : 'שלח שוב'}
                        </button>
                        {/* Fallback: when the 2Sign task is gone (TASK_NOT_FOUND
                            → 410 from the resend), the office can upload a
                            fresh PDF here to restart the signing from scratch.
                            Same handler as declined/expired but visible up-front
                            so the office doesn't have to wait for the 410. */}
                        <input
                          ref={el => { fileInputRefs.current[doc.documentType] = el }}
                          type="file"
                          accept=".pdf"
                          className={styles.fileInput}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileSelected(doc.documentType, file)
                          }}
                        />
                        <button
                          className={styles.resendBtn}
                          onClick={() => fileInputRefs.current[doc.documentType]?.click()}
                          disabled={sending === doc.documentType || !clientEmail}
                          title="העלה PDF חדש והתחל את החתימה מחדש (תחליף את המשימה הקיימת)"
                          type="button"
                          style={{ fontSize: 11 }}
                        >
                          {'⤴ התחל מחדש'}
                        </button>
                      </>
                    )}

                    {task && status === 'awaiting-office-authorize' && (
                      <button
                        className={styles.authorizeBtn}
                        onClick={() => handleAuthorize(task.taskGuid)}
                        disabled={authorizing === task.taskGuid}
                        type="button"
                        title="החל חתימת משרד — יחתום, ישמור ויעדכן את הסאמיט"
                      >
                        {authorizing === task.taskGuid ? 'מאשר...' : 'אשר עכשיו'}
                      </button>
                    )}

                    {task?.stampedDocUrl ? (
                      <a href={task.stampedDocUrl} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>
                        {'צפה (חתום)'}
                      </a>
                    ) : task?.signedDocUrl && (
                      <a href={task.signedDocUrl} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>
                        {'צפה'}
                      </a>
                    )}

                    {(status === 'declined' || status === 'expired') && (
                      <>
                        <input
                          ref={el => { fileInputRefs.current[doc.documentType] = el }}
                          type="file"
                          accept=".pdf"
                          className={styles.fileInput}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileSelected(doc.documentType, file)
                          }}
                        />
                        <button
                          className={styles.sendBtn}
                          onClick={() => fileInputRefs.current[doc.documentType]?.click()}
                          disabled={sending === doc.documentType}
                          type="button"
                        >
                          {'שלח מחדש'}
                        </button>
                      </>
                    )}

                    {/*
                      Post-signed restart. Office picks a fresh PDF; backend
                      replaces the signed task in place (handleFileSelected
                      passes supersedeExisting=true). Confirm prompt because
                      this throws away a completed signed result.
                    */}
                    {status === 'signed' && (
                      <>
                        <input
                          ref={el => { fileInputRefs.current[doc.documentType] = el }}
                          type="file"
                          accept=".pdf"
                          className={styles.fileInput}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const ok = window.confirm(
                              'המסמך כבר חתום. שליחה חדשה תחליף את המשימה החתומה הקיימת — להמשיך?',
                            )
                            if (ok) handleFileSelected(doc.documentType, file)
                            else if (fileInputRefs.current[doc.documentType]) {
                              fileInputRefs.current[doc.documentType]!.value = ''
                            }
                          }}
                        />
                        <div className={styles.sendBtnWrap}>
                          <button
                            className={styles.resendBtn}
                            onClick={() => fileInputRefs.current[doc.documentType]?.click()}
                            disabled={sending === doc.documentType || !clientEmail}
                            title={
                              !clientEmail
                                ? 'חסר אימייל לקוח'
                                : 'התחל מחדש — העלה PDF חדש ושלח לחתימה (תחליף את המסמך החתום)'
                            }
                            type="button"
                          >
                            {sending === doc.documentType ? '⏳ שולח ל-2Sign…' : 'שלח שוב'}
                          </button>
                          {sending === doc.documentType && (
                            <div className={styles.sendProgress} aria-label="שולח" />
                          )}
                        </div>
                      </>
                    )}

                    {/*
                      Office manual-overtake disclosure (Path A — upload pre-signed PDF).
                      Visible in ALL task states for 2Sign docs (no-task, in-flight, signed).
                      Lets the office bypass 2Sign entirely OR replace a stuck/wrong task.
                      Path B (click-to-place coord override + re-stamp) lands here in a
                      follow-up PR — same disclosure, second action.
                    */}
                    <details
                      style={{
                        marginInlineStart: 8,
                        fontSize: 12,
                        flexBasis: '100%',
                        marginTop: 4,
                      }}
                    >
                      <summary
                        style={{
                          cursor: 'pointer',
                          color: '#6B7280',
                          userSelect: 'none',
                          listStyle: 'none',
                        }}
                      >
                        {'⚙ התערבות ידנית'}
                      </summary>
                      <div style={{ marginTop: 6, paddingInlineStart: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          ref={el => { manualFileRefs.current[doc.documentType] = el }}
                          type="file"
                          accept=".pdf"
                          className={styles.fileInput}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleManualSign(doc.documentType, file, task)
                          }}
                        />
                        <button
                          className={styles.resendBtn}
                          onClick={() => manualFileRefs.current[doc.documentType]?.click()}
                          disabled={sending === doc.documentType}
                          title={
                            task
                              ? 'העלאת PDF חתום ידנית תחליף את המשימה הקיימת'
                              : 'העלה PDF חתום ידנית (עוקף 2Sign)'
                          }
                          type="button"
                        >
                          {task ? '⤴ העלה PDF חתום (החלף משימה קיימת)' : '⤴ העלה PDF חתום (עקיפת 2Sign)'}
                        </button>

                        {/*
                          Path B — click-to-place coord override + re-stamp.
                          Only meaningful when:
                            (a) the form has an office stamp (auto-stamp territory) — checked via FORM_LAYOUTS.officeStamp
                            (b) the task exists AND has a preStampDocUrl (preserved by signing-poller from PR #133 onward)
                          Older records lack preStampDocUrl → button disabled with a tooltip explaining Path A is the fallback.
                        */}
                        {FORM_LAYOUTS[doc.formType]?.officeStamp && (
                          <button
                            className={styles.resendBtn}
                            onClick={() => setRestampOpenFor(doc.documentType)}
                            disabled={!task?.preStampDocUrl}
                            title={
                              task?.preStampDocUrl
                                ? 'פתח חלון לכיוון מיקום החותמת והתאריך — יחיל מחדש על ה-PDF המקורי'
                                : 'ה-PDF המקורי לא נשמר עבור משימה זו — השתמש בנתיב ההעלאה הידנית'
                            }
                            type="button"
                          >
                            {'🎯 כיוון מיקום החותמת'}
                          </button>
                        )}
                        {/*
                          Universal manual placement (Layer 1 spine). Available
                          for EVERY 2Sign doc — the always-on clean bypass when
                          auto-detection is off or missing. Needs an existing
                          PDF to place on (preStamp → signed → stamped fallback);
                          disabled w/ tooltip if none yet.
                        */}
                        {(() => {
                          const placementPdfUrl =
                            task?.preStampDocUrl || task?.signedDocUrl || task?.stampedDocUrl || null
                          return (
                            <button
                              className={styles.resendBtn}
                              onClick={() => setPlacementOpenFor(doc.documentType)}
                              disabled={!placementPdfUrl}
                              title={
                                placementPdfUrl
                                  ? 'מיקום חתימות / תאריך / טקסט — הצעה חכמה + עקיפה ידנית נקייה (לומד לפעם הבאה)'
                                  : 'נדרש PDF קיים — שלח לחתימה או העלה PDF חתום תחילה'
                              }
                              type="button"
                            >
                              {'🎯 מיקום חתימות (חכם)'}
                            </button>
                          )
                        })()}
                      </div>
                    </details>
                  </>
                )}

                {doc.method === 'external' && (
                  <>
                    {!task && doc.documentType === 'poa-nii-representatives' && (
                      <div className={styles.externalTwoPhase}>
                        <div className={styles.externalPhase}>
                          <span className={styles.phaseLabel}>{'1. שלח קישור'}</span>
                          <div className={styles.externalFlow}>
                            <input
                              className={styles.linkInput}
                              type="url"
                              placeholder="הדבק קישור ב״ל מיוצגים"
                              value={externalLink[doc.documentType] || ''}
                              onChange={(e) => setExternalLink(prev => ({ ...prev, [doc.documentType]: e.target.value }))}
                            />
                            <button
                              className={styles.sendBtn}
                              onClick={() => handleSendBtlLink(doc.documentType)}
                              disabled={!(externalLink[doc.documentType] || '').trim() || !clientPhone}
                              title={!clientPhone ? 'חסר טלפון לקוח' : 'שלח ב-WhatsApp עם הקישור'}
                              type="button"
                            >
                              {'שלח ב-WhatsApp'}
                            </button>
                          </div>
                        </div>
                        <div className={styles.externalPhase}>
                          <span className={styles.phaseLabel}>{'2. סמן הושלם כשהלקוח מאשר'}</span>
                          <div className={styles.externalFlow}>
                            <input
                              className={styles.refInput}
                              type="text"
                              placeholder="מספר אסמכתא"
                              value={externalRef[doc.documentType] || ''}
                              onChange={(e) => setExternalRef(prev => ({ ...prev, [doc.documentType]: e.target.value }))}
                            />
                            <button
                              className={styles.sendBtn}
                              onClick={() => handleMarkExternalDone(doc.documentType)}
                              disabled={sending === doc.documentType}
                              type="button"
                            >
                              {sending === doc.documentType ? 'שומר...' : 'סמן הושלם'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!task && doc.documentType !== 'poa-nii-representatives' && (
                      <div className={styles.externalFlow}>
                        <input
                          className={styles.refInput}
                          type="text"
                          placeholder="מספר אסמכתא"
                          value={externalRef[doc.documentType] || ''}
                          onChange={(e) => setExternalRef(prev => ({ ...prev, [doc.documentType]: e.target.value }))}
                        />
                        <button
                          className={styles.sendBtn}
                          onClick={() => handleMarkExternalDone(doc.documentType)}
                          disabled={sending === doc.documentType}
                          type="button"
                        >
                          {sending === doc.documentType ? 'שומר...' : 'סמן הושלם'}
                        </button>
                      </div>
                    )}

                    {isComplete && (
                      <>
                        <span className={styles.externalDone}>{'הושלם'}</span>
                        {task?.signedDocUrl ? (
                          <a href={task.signedDocUrl} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>
                            {'צפה'}
                          </a>
                        ) : (
                          <>
                            <input
                              ref={el => { externalDoneFileRefs.current[doc.documentType] = el }}
                              type="file"
                              accept=".pdf"
                              className={styles.fileInput}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleExternalDocUpload(doc.documentType, file)
                              }}
                            />
                            <button
                              className={styles.resendBtn}
                              onClick={() => externalDoneFileRefs.current[doc.documentType]?.click()}
                              disabled={sending === doc.documentType}
                              type="button"
                            >
                              {sending === doc.documentType ? 'מעלה...' : 'העלה PDF חתום'}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.helpNote}>
        {'PDF ייפוי כוח מופק ידנית בשע"מ / ביטוח לאומי ומועלה כאן לחתימה. קישור ב"ל מיוצגים נשלח ללקוח ישירות.'}
      </div>

      {/* Path B v2 — drag-based placement with 4 element overlays. */}
      {restampOpenFor && (() => {
        const targetTask = tasks.find(t => t.documentType === restampOpenFor)
        const targetDoc = ALL_SIGNING_DOCS.find(d => d.documentType === restampOpenFor)
        const layout = targetDoc ? FORM_LAYOUTS[targetDoc.formType] : undefined
        if (!targetTask?.preStampDocUrl || !layout?.officeStamp || !layout.officeDate || !layout.officeFirmName) {
          return null
        }
        // Today's date in dd/mm/yyyy — same format applyOfficeStamp would paint.
        const d = new Date()
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const previewDateStr = `${dd}/${mm}/${d.getFullYear()}`
        // Manager stamp URL — served from the OS public assets folder if present.
        // For the demo we fall back to a non-image placeholder if absent.
        // Real autograph PNG served from a route that decodes the inline
        // base64 in manager-stamps.ts. Avoids the gold-placeholder fallback
        // and gives Path B v2's draggable preview true WYSIWYG.
        const manager = accountManager || 'אבי ביטן'
        const stampUrl = manager.includes('רון')
          ? '/api/onboarding/stamps/ron'
          : '/api/onboarding/stamps/avi'
        return (
          <RestampModal
            open
            onClose={() => setRestampOpenFor(null)}
            summitEntityId={summitEntityId}
            documentType={restampOpenFor}
            defaults={{
              officeStamp: layout.officeStamp,
              officeDate: layout.officeDate,
              officeFirmName: layout.officeFirmName,
              clientDate: {
                x: layout.clientDate.x,
                yFromTop: layout.clientDate.autoStampTextBaselineFromTop,
                fontSize: layout.clientDate.autoStampFontSize,
              },
            }}
            managerStampUrl={stampUrl}
            previewDateStr={previewDateStr}
            onSuccess={() => {
              setRestampOpenFor(null)
              onTasksChanged()
            }}
          />
        )
      })()}

      {/* Universal PlacementStudio — Layer 1 spine. Suggests positions from
          the real form, lets the office accept/drag/add, applies, and records
          the placement so next time is smarter. Sourced from the task's
          available PDF (preStamp → signed → stamped). */}
      {placementOpenFor && (() => {
        const targetTask = tasks.find(t => t.documentType === placementOpenFor)
        const targetDoc = ALL_SIGNING_DOCS.find(d => d.documentType === placementOpenFor)
        const placementPdfUrl =
          targetTask?.preStampDocUrl || targetTask?.signedDocUrl || targetTask?.stampedDocUrl
        if (!placementPdfUrl || !targetDoc) return null
        return (
          <PlacementStudio
            open
            onClose={() => setPlacementOpenFor(null)}
            pdfUrl={placementPdfUrl}
            formType={targetDoc.formType || targetDoc.documentType}
            summitEntityId={summitEntityId}
            documentType={placementOpenFor}
            onSuccess={() => {
              setPlacementOpenFor(null)
              onTasksChanged()
            }}
          />
        )
      })()}

      {/* Office-side authorize modal — mirrors the email-link AuthorizeFlow.
          See AuthorizeModal for rationale (unified UX, multi-step preview +
          optional note + deliberate confirm). */}
      <AuthorizeModal
        open={!!authorizeModalToken}
        token={authorizeModalToken}
        onClose={() => setAuthorizeModalToken(null)}
        onSuccess={onTasksChanged}
      />
    </div>
  )
}
