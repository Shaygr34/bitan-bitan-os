'use client'

import { useState } from 'react'
import styles from './ClientInfoCard.module.css'

interface Props {
  summitData: {
    phone?: string
    email?: string
    sector?: string
    address?: string
    clientType?: string
    accountManager?: string
    auditWorker?: string
    bookkeeper?: string
  }
  clientName: string
  clientType?: string
  companyNumber?: string
  /** Sanity onboardingRecord _id — required to PATCH the BTL link. */
  recordId?: string
  /** Office-managed BTL מיוצגים link (URL the office got from meyutzagim.btl.gov.il). */
  nationalInsuranceRepLink?: string
  /** Called after successful PATCH so parent re-fetches the record. */
  onRecordUpdated?: () => void
}

export default function ClientInfoCard({
  summitData,
  clientName,
  clientType,
  companyNumber,
  recordId,
  nationalInsuranceRepLink,
  onRecordUpdated,
}: Props) {
  const fields: Array<{ label: string; value: string | undefined }> = [
    { label: 'שם לקוח', value: clientName },
    { label: 'סוג לקוח', value: clientType || summitData.clientType },
    { label: 'ח.פ / ת.ז', value: companyNumber },
    { label: 'טלפון', value: summitData.phone },
    { label: 'אימייל', value: summitData.email },
    { label: 'תחום עיסוק', value: summitData.sector },
    { label: 'כתובת', value: summitData.address },
    { label: 'מנהל תיק', value: summitData.accountManager },
    { label: 'עובד/ת ביקורת', value: summitData.auditWorker },
    { label: 'מנהל/ת חשבונות', value: summitData.bookkeeper },
  ]

  // BTL מיוצגים link — office-managed CMS field. Editable inline.
  const [btlLinkDraft, setBtlLinkDraft] = useState(nationalInsuranceRepLink || '')
  const [savingBtl, setSavingBtl] = useState(false)
  const [btlError, setBtlError] = useState<string | null>(null)
  const [btlSaved, setBtlSaved] = useState(false)
  const btlIsDirty = btlLinkDraft.trim() !== (nationalInsuranceRepLink || '').trim()

  const saveBtlLink = async () => {
    if (!recordId) {
      setBtlError('חסר מזהה רשומה — רענן את הדף')
      return
    }
    setSavingBtl(true)
    setBtlError(null)
    setBtlSaved(false)
    try {
      const res = await fetch('/api/onboarding/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId,
          patch: { nationalInsuranceRepLink: btlLinkDraft.trim() || null },
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `שגיאה: ${res.status}`)
      }
      setBtlSaved(true)
      setTimeout(() => setBtlSaved(false), 2500)
      onRecordUpdated?.()
    } catch (err) {
      setBtlError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSavingBtl(false)
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.header}>פרטי לקוח</h3>
      <div className={styles.grid}>
        {fields.map((f) => (
          <div key={f.label} className={styles.field}>
            <span className={styles.fieldLabel}>{f.label}</span>
            <span className={f.value ? styles.fieldValue : `${styles.fieldValue} ${styles.empty}`}>
              {f.value || '—'}
            </span>
          </div>
        ))}
      </div>

      {/* BTL מיוצגים office-managed CMS link. Pasted after registering the
          client at meyutzagim.btl.gov.il. Sent to client via WhatsApp from
          the SigningCard ב"ל מיוצגים row. */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed #E5E7EB' }}>
        <label
          htmlFor="btl-link-input"
          style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}
        >
          קישור ב״ל מיוצגים (משרד)
        </label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            id="btl-link-input"
            type="url"
            value={btlLinkDraft}
            onChange={(e) => setBtlLinkDraft(e.target.value)}
            placeholder="https://meyazegs.btl.gov.il/..."
            disabled={savingBtl}
            dir="ltr"
            style={{
              flex: 1,
              fontSize: 12,
              padding: '4px 8px',
              border: '1px solid #D1D5DB',
              borderRadius: 4,
              minWidth: 0,
              fontFamily: 'monospace',
            }}
          />
          {btlIsDirty && (
            <button
              type="button"
              onClick={saveBtlLink}
              disabled={savingBtl}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: '1px solid #1B2A4A',
                background: '#1B2A4A',
                color: '#fff',
                borderRadius: 4,
                cursor: savingBtl ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {savingBtl ? '⏳ שומר…' : 'שמור'}
            </button>
          )}
          {btlSaved && !btlIsDirty && (
            <span style={{ fontSize: 11, color: '#10B981', whiteSpace: 'nowrap' }}>{'✓ נשמר'}</span>
          )}
        </div>
        {btlError && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#991B1B' }}>{btlError}</div>
        )}
        <div style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF' }}>
          הקישור נוצר לאחר רישום הלקוח באתר meyutzagim.btl.gov.il. אבי/רון מדביקים אותו כאן ונשלח ללקוח בשלב חתימה.
        </div>
      </div>
    </div>
  )
}
