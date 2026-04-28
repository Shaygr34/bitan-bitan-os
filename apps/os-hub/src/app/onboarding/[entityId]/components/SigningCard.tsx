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
  currentStage: number
  tasks: SigningTask[]
  onTasksChanged: () => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לשליחה',
  sent: 'נשלח — ממתין לחתימה',
  signed: 'נחתם',
  declined: 'סורב',
  expired: 'פג תוקף',
}

const STATUS_ICONS: Record<string, string> = {
  pending: '\u23F3',  // hourglass
  sent: '\u2709',     // envelope
  signed: '\u2714',   // checkmark
  declined: '\u2718', // x
  expired: '\u26A0',  // warning
}

/**
 * Required signing documents per onboarding stage 2.
 * These are the ייפוי כוח documents the client must sign.
 * Template IDs will be configured once Avi provides the PDFs.
 */
const REQUIRED_SIGNINGS = [
  { documentType: 'power-of-attorney', label: 'ייפוי כוח — מ"ה / מע"מ / ניכויים / ב"ל' },
]

export default function SigningCard({
  summitEntityId,
  clientName,
  clientEmail,
  clientPhone,
  clientIdNumber,
  currentStage,
  tasks,
  onTasksChanged,
}: Props) {
  const [sending, setSending] = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          // templateId will be added once configured
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        if (res.status === 409) {
          // Task already exists — just refresh
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

  // Only show on stage 2 or if there are active signing tasks
  if (currentStage < 1 && tasks.length === 0) return null

  const completedCount = tasks.filter(t => t.status === 'signed').length
  const totalRequired = REQUIRED_SIGNINGS.length

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>חתימה דיגיטלית</h3>
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
        {REQUIRED_SIGNINGS.map(({ documentType, label }) => {
          const task = tasks.find(t => t.documentType === documentType)
          const status = task?.status || 'pending'
          const icon = STATUS_ICONS[status] || ''
          const statusLabel = STATUS_LABELS[status] || status

          return (
            <div key={documentType} className={`${styles.taskRow} ${styles[`status_${status}`] || ''}`}>
              <div className={styles.taskInfo}>
                <span className={styles.taskIcon}>{icon}</span>
                <div className={styles.taskLabels}>
                  <span className={styles.taskLabel}>{label}</span>
                  <span className={styles.taskStatus}>{statusLabel}</span>
                </div>
              </div>

              <div className={styles.taskActions}>
                {!task && (
                  <button
                    className={styles.sendBtn}
                    onClick={() => handleSendForSigning(documentType)}
                    disabled={sending === documentType || !clientEmail}
                    type="button"
                  >
                    {sending === documentType ? 'שולח...' : 'שלח לחתימה'}
                  </button>
                )}

                {task && (task.status === 'sent' || task.status === 'pending') && (
                  <button
                    className={styles.resendBtn}
                    onClick={() => handleResend(task.taskGuid)}
                    disabled={resending === task.taskGuid}
                    type="button"
                  >
                    {resending === task.taskGuid ? 'שולח...' : 'שלח שוב'}
                  </button>
                )}

                {task?.status === 'signed' && task.signedDocUrl && (
                  <a
                    href={task.signedDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewBtn}
                  >
                    צפה במסמך
                  </a>
                )}

                {(task?.status === 'declined' || task?.status === 'expired') && (
                  <button
                    className={styles.sendBtn}
                    onClick={() => handleSendForSigning(documentType)}
                    disabled={sending === documentType}
                    type="button"
                  >
                    שלח מחדש
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
