'use client'

import { useState, useCallback } from 'react'
import type { SigningTask } from '@/lib/onboarding/types'
import styles from './SigningCard.module.css'

interface Props {
  summitEntityId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientIdNumber?: string
  clientType?: string
  currentStage: number
  tasks: SigningTask[]
  onTasksChanged: () => void
}

const STATUS_LABELS: Record<string, string> = {
  'not-started': 'טרם הופק',
  pending: 'הופק — ממתין להעלאה',
  sent: 'נשלח — ממתין לחתימת לקוח',
  'awaiting-counter': 'לקוח חתם — ממתין לחתימת מנהל',
  signed: 'נחתם',
  declined: 'סורב',
  expired: 'פג תוקף',
  'external-sent': 'קישור נשלח — ממתין ללקוח',
  'external-done': 'הושלם',
}

const STATUS_ICONS: Record<string, string> = {
  'not-started': '\u25CB',   // empty circle
  pending: '\u23F3',          // hourglass
  sent: '\u2709',             // envelope
  'awaiting-counter': '\u270D', // writing hand
  signed: '\u2714',           // checkmark
  declined: '\u2718',         // x
  expired: '\u26A0',          // warning
  'external-sent': '\u2197',  // arrow
  'external-done': '\u2714',  // checkmark
}

/**
 * ייפוי כוח document types for onboarding stage 2.
 *
 * 3 types based on Ron's specification:
 * 1. רשות המיסים — PDF from שע"מ, 2Sign with async counter-signature (client → Avi/Ron)
 * 2. ב"ל ניכויים — PDF from ביטוח לאומי, 2Sign client-only (employers only)
 * 3. ב"ל מיוצגים — external BTL link + אסמכתא, NO 2Sign
 */
interface SigningDocType {
  documentType: string
  label: string
  description: string
  /** 'twosign' = uploaded PDF via 2Sign, 'external' = link sent to client */
  method: 'twosign' | 'external'
  /** For twosign: does Avi/Ron need to counter-sign after client? */
  requiresCounterSign: boolean
  /** Only show for certain client types? null = always */
  clientTypeFilter: string[] | null
}

const ALL_SIGNING_DOCS: SigningDocType[] = [
  {
    documentType: 'poa-tax-authority',
    label: 'ייפוי כוח רשות המיסים',
    description: 'מ"ה / מע"מ / ניכויים — הופק בשע"מ, חתימת לקוח + מנהל תיק',
    method: 'twosign',
    requiresCounterSign: true,
    clientTypeFilter: null, // All clients
  },
  {
    documentType: 'poa-nii-withholdings',
    label: 'ייפוי כוח ב"ל ניכויים',
    description: 'למעסיקים — הופק בביטוח לאומי, חתימת מעסיק בלבד',
    method: 'twosign',
    requiresCounterSign: false,
    clientTypeFilter: ['חברה', 'חברה בע"מ', 'שותפות', 'עמותה'], // Employers only
  },
  {
    documentType: 'poa-nii-representatives',
    label: 'ייפוי כוח ב"ל מיוצגים',
    description: 'קישור מביטוח לאומי — הלקוח ממלא ומאשר באתר ב"ל',
    method: 'external',
    requiresCounterSign: false,
    clientTypeFilter: null, // All clients
  },
]

export default function SigningCard({
  summitEntityId,
  clientName,
  clientEmail,
  clientPhone,
  clientIdNumber,
  clientType,
  currentStage,
  tasks,
  onTasksChanged,
}: Props) {
  const [sending, setSending] = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [externalRef, setExternalRef] = useState<Record<string, string>>({})

  // Filter documents relevant to this client type
  const relevantDocs = ALL_SIGNING_DOCS.filter(doc => {
    if (!doc.clientTypeFilter) return true
    return doc.clientTypeFilter.includes(clientType || '')
  })

  const handleSendForSigning = useCallback(async (documentType: string) => {
    setSending(documentType)
    setError(null)

    try {
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
    }
  }, [summitEntityId, clientName, clientEmail, clientPhone, clientIdNumber, onTasksChanged])

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

  /** Mark an external (non-2Sign) document as complete */
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
        throw new Error(data.error || `שגיאה: ${res.status}`)
      }

      onTasksChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSending(null)
    }
  }, [summitEntityId, clientName, clientEmail, externalRef, onTasksChanged])

  // Only show if there's something relevant
  if (currentStage < 1 && tasks.length === 0) return null

  const completedCount = relevantDocs.filter(doc => {
    const task = tasks.find(t => t.documentType === doc.documentType)
    return task?.status === 'signed' || task?.status === 'external-done'
  }).length
  const totalRequired = relevantDocs.length

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>ייפוי כוח — חתימות</h3>
        <span className={styles.count}>
          {completedCount}/{totalRequired}
        </span>
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
            <div key={doc.documentType} className={`${styles.taskRow} ${isComplete ? styles.status_signed : ''} ${status === 'declined' || status === 'expired' ? styles.status_declined : ''}`}>
              <div className={styles.taskInfo}>
                <span className={styles.taskIcon}>{icon}</span>
                <div className={styles.taskLabels}>
                  <span className={styles.taskLabel}>{doc.label}</span>
                  <span className={styles.taskDescription}>{doc.description}</span>
                  <span className={styles.taskStatus}>{statusLabel}</span>
                  {doc.requiresCounterSign && status === 'awaiting-counter' && (
                    <span className={styles.counterSignNote}>
                      נדרשת חתימת מנהל תיק ב-2Sign
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.taskActions}>
                {/* 2Sign documents */}
                {doc.method === 'twosign' && (
                  <>
                    {!task && (
                      <button
                        className={styles.sendBtn}
                        onClick={() => handleSendForSigning(doc.documentType)}
                        disabled={sending === doc.documentType || !clientEmail}
                        title={!clientEmail ? 'חסר אימייל לקוח' : 'העלה PDF ושלח לחתימה'}
                        type="button"
                      >
                        {sending === doc.documentType ? 'שולח...' : 'שלח לחתימה'}
                      </button>
                    )}

                    {task && (status === 'sent' || status === 'pending') && (
                      <button
                        className={styles.resendBtn}
                        onClick={() => handleResend(task.taskGuid)}
                        disabled={resending === task.taskGuid}
                        type="button"
                      >
                        {resending === task.taskGuid ? 'שולח...' : 'שלח שוב'}
                      </button>
                    )}

                    {task?.signedDocUrl && (
                      <a
                        href={task.signedDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.viewBtn}
                      >
                        צפה
                      </a>
                    )}

                    {(status === 'declined' || status === 'expired') && (
                      <button
                        className={styles.sendBtn}
                        onClick={() => handleSendForSigning(doc.documentType)}
                        disabled={sending === doc.documentType}
                        type="button"
                      >
                        שלח מחדש
                      </button>
                    )}
                  </>
                )}

                {/* External documents (ב"ל מיוצגים) */}
                {doc.method === 'external' && (
                  <>
                    {!task && (
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
                      <span className={styles.externalDone}>הושלם</span>
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
    </div>
  )
}
