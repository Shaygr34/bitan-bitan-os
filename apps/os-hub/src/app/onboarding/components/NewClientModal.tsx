'use client'

import { useState, useEffect, useCallback } from 'react'
import styles from './NewClientModal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

const CLIENT_TYPES = [
  'עוסק מורשה',
  'עוסק פטור',
  'חברה בע"מ',
  'שותפות',
  'עסק זעיר',
  'עמותה',
  'החזר מס',
]

const MANAGERS = ['אבי ביטן', 'רון ביטן']

export default function NewClientModal({ isOpen, onClose, onCreated }: Props) {
  const [clientName, setClientName] = useState('')
  const [clientType, setClientType] = useState(CLIENT_TYPES[0])
  const [manager, setManager] = useState(MANAGERS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = useCallback(() => {
    setClientName('')
    setClientType(CLIENT_TYPES[0])
    setManager(MANAGERS[0])
    setLoading(false)
    setError(null)
    setGeneratedUrl(null)
    setCopied(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      reset()
    }
  }, [isOpen, reset])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleSubmit = async () => {
    if (!clientName.trim()) {
      setError('יש להזין שם לקוח')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Step 1: Generate intake token
      const tokenRes = await fetch('/api/intake/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: clientName.trim(), clientType, manager }),
      })

      if (!tokenRes.ok) {
        const data = await tokenRes.json().catch(() => ({})) // eslint-disable-line
        throw new Error(data.error || 'Failed to generate intake link')
      }

      const tokenData = await tokenRes.json()

      // Step 2: Create onboarding record
      const recordRes = await fetch('/api/onboarding/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientType,
          accountManager: manager,
          intakeToken: tokenData.token,
        }),
      })

      if (!recordRes.ok) {
        const data = await recordRes.json().catch(() => ({})) // eslint-disable-line
        throw new Error(data.error || 'Failed to create onboarding record')
      }

      setGeneratedUrl(tokenData.url)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text
    }
  }

  const handleBackdropClick = () => {
    onClose()
  }

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.card} onClick={handleCardClick}>
        <h2 className={styles.title}>לקוח חדש</h2>

        <div className={styles.field}>
          <label htmlFor="ncm-name">שם לקוח</label>
          <input
            id="ncm-name"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="שם מלא או שם עסק"
            disabled={loading || !!generatedUrl}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="ncm-type">סוג לקוח</label>
          <select
            id="ncm-type"
            value={clientType}
            onChange={(e) => setClientType(e.target.value)}
            disabled={loading || !!generatedUrl}
          >
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="ncm-manager">מנהל תיק</label>
          <select
            id="ncm-manager"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            disabled={loading || !!generatedUrl}
          >
            {MANAGERS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {generatedUrl && (
          <div className={styles.successBox}>
            <div className={styles.successLabel}>קישור נוצר בהצלחה</div>
            <div className={styles.linkRow}>
              <span className={styles.linkText}>{generatedUrl}</span>
              <button className={styles.copyBtn} onClick={handleCopy} type="button">
                {copied ? 'הועתק!' : 'העתק'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          {!generatedUrl ? (
            <>
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={loading || !clientName.trim()}
                type="button"
              >
                {loading ? 'יוצר...' : 'צור קישור'}
              </button>
              <button className={styles.cancelBtn} onClick={onClose} type="button">
                ביטול
              </button>
            </>
          ) : (
            <button className={styles.cancelBtn} onClick={onClose} type="button">
              סגור
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
