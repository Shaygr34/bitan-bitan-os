'use client'

import { useState, useMemo } from 'react'
import styles from './ClientInfoCard.module.css'
import {
  CLIENT_TYPE_OPTIONS,
  BUSINESS_SECTOR_OPTIONS,
  ACCOUNT_MANAGER_OPTIONS,
  AUDIT_WORKER_OPTIONS,
  findOptionByLabel,
  type SumitOption,
} from '@/lib/onboarding/sumit-lookups'

interface Props {
  /** Summit numeric entity ID — needed to push edits back. */
  summitEntityId: string
  summitData: {
    phone?: string
    email?: string
    sector?: string
    address?: string
    clientType?: string
    accountManager?: string
    auditWorker?: string
    bookkeeper?: string
    city?: string
    zipCode?: string
    birthdate?: string
    centralNote?: string
  }
  clientName: string
  clientType?: string
  companyNumber?: string
  /** Sanity onboardingRecord _id — required to PATCH the BTL link. */
  recordId?: string
  /** Office-managed BTL מיוצגים link. */
  nationalInsuranceRepLink?: string
  /** Called after successful save so parent re-fetches. */
  onRecordUpdated?: () => void
}

/** All editable fields kept in one shape for batched save. */
interface DraftState {
  Customers_FullName: string
  Customers_CompanyNumber: string
  Customers_Phone: string
  Customers_EmailAddress: string
  Customers_Address: string
  Customers_City: string
  Customers_ZipCode: string
  Customers_Birthdate: string // ISO date or empty
  Customers_Text: string
  'סוג לקוח': string // entity-ref label
  'תחום עיסוק': string
  'מנהל תיק': string
  'מנהל/ת חשבונות': string
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  border: '1px solid #D1D5DB',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  textAlign: 'right',
  direction: 'rtl',
  boxSizing: 'border-box',
  minWidth: 0,
}

export default function ClientInfoCard({
  summitEntityId,
  summitData,
  clientName,
  clientType,
  companyNumber,
  recordId,
  nationalInsuranceRepLink,
  onRecordUpdated,
}: Props) {
  // Server-fetched canonical values, used to seed the draft when edit mode opens.
  const initialDraft = useMemo<DraftState>(
    () => ({
      Customers_FullName: clientName || '',
      Customers_CompanyNumber: companyNumber || '',
      Customers_Phone: summitData.phone || '',
      Customers_EmailAddress: summitData.email || '',
      Customers_Address: summitData.address || '',
      Customers_City: summitData.city || '',
      Customers_ZipCode: summitData.zipCode || '',
      Customers_Birthdate: summitData.birthdate || '',
      Customers_Text: summitData.centralNote || '',
      'סוג לקוח': clientType || summitData.clientType || '',
      'תחום עיסוק': summitData.sector || '',
      'מנהל תיק': summitData.accountManager || '',
      'מנהל/ת חשבונות': summitData.bookkeeper || '',
    }),
    [clientName, companyNumber, clientType, summitData],
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftState>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // BTL link inline edit (kept separate — saves to Sanity, not Sumit).
  const [btlLinkDraft, setBtlLinkDraft] = useState(nationalInsuranceRepLink || '')
  const [savingBtl, setSavingBtl] = useState(false)
  const [btlError, setBtlError] = useState<string | null>(null)
  const [btlSaved, setBtlSaved] = useState(false)
  const btlIsDirty = btlLinkDraft.trim() !== (nationalInsuranceRepLink || '').trim()

  /** Compute which scalar/entity-ref fields actually changed vs initial. */
  const dirtyFields = useMemo(() => {
    const changes: Record<string, unknown> = {}
    for (const k of Object.keys(initialDraft) as (keyof DraftState)[]) {
      if (draft[k] !== initialDraft[k]) {
        // For entity-ref fields convert label → ID before sending.
        if (k === 'סוג לקוח') {
          const opt = findOptionByLabel(CLIENT_TYPE_OPTIONS, draft[k])
          changes[k] = opt ? opt.id : null
        } else if (k === 'תחום עיסוק') {
          const opt = findOptionByLabel(BUSINESS_SECTOR_OPTIONS, draft[k])
          changes[k] = opt ? opt.id : null
        } else if (k === 'מנהל תיק') {
          const opt = findOptionByLabel(ACCOUNT_MANAGER_OPTIONS, draft[k])
          changes[k] = opt ? opt.id : null
        } else if (k === 'מנהל/ת חשבונות') {
          const opt = findOptionByLabel(AUDIT_WORKER_OPTIONS, draft[k])
          changes[k] = opt ? opt.id : null
        } else {
          changes[k] = draft[k]
        }
      }
    }
    return changes
  }, [draft, initialDraft])

  const isDirty = Object.keys(dirtyFields).length > 0

  const enterEdit = () => {
    setDraft(initialDraft)
    setEditing(true)
    setSaveError(null)
    setSaveOk(false)
  }

  const cancelEdit = () => {
    setDraft(initialDraft)
    setEditing(false)
    setSaveError(null)
  }

  const saveEdits = async () => {
    if (!isDirty) {
      setEditing(false)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/onboarding/sumit-entity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: summitEntityId, fields: dirtyFields }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `שגיאה: ${res.status}`)
      }
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
      setEditing(false)
      onRecordUpdated?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

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

  const renderRow = (label: string, key: keyof DraftState, opts?: SumitOption[]) => {
    const displayValue = draft[key]
    if (!editing) {
      return (
        <div key={label} className={styles.field}>
          <span className={styles.fieldLabel}>{label}</span>
          <span className={displayValue ? styles.fieldValue : `${styles.fieldValue} ${styles.empty}`}>
            {displayValue || '—'}
          </span>
        </div>
      )
    }
    // Edit mode
    return (
      <div key={label} className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        {opts ? (
          <select
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            style={{ ...fieldStyle, cursor: 'pointer' }}
          >
            <option value="">— ללא —</option>
            {opts.map((o) => (
              <option key={o.id} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        ) : key === 'Customers_Birthdate' ? (
          <input
            type="date"
            value={draft[key]?.slice(0, 10) || ''}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            style={fieldStyle}
          />
        ) : key === 'Customers_Text' ? (
          <textarea
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            rows={2}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        ) : (
          <input
            type="text"
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            style={fieldStyle}
          />
        )}
      </div>
    )
  }

  return (
    <div className={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 className={styles.header}>פרטי לקוח</h3>
        {!editing ? (
          <button
            type="button"
            onClick={enterEdit}
            title="ערוך פרטי לקוח (הנתונים יתעדכנו בסאמיט)"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid #D1D5DB',
              background: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            ✏ ערוך
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: '1px solid #D1D5DB',
                background: '#fff',
                borderRadius: 4,
                cursor: 'pointer',
                color: '#6B7280',
              }}
            >
              ✗ בטל
            </button>
            <button
              type="button"
              onClick={saveEdits}
              disabled={saving || !isDirty}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                border: '1px solid #1B2A4A',
                background: isDirty ? '#1B2A4A' : '#9CA3AF',
                color: '#fff',
                borderRadius: 4,
                cursor: !isDirty ? 'not-allowed' : saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? '⏳ שומר…' : `✓ שמור${isDirty ? ` (${Object.keys(dirtyFields).length})` : ''}`}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div
          style={{
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            padding: 6,
            borderRadius: 4,
            margin: '6px 0',
            fontSize: 12,
          }}
        >
          {saveError}
        </div>
      )}
      {saveOk && (
        <div
          style={{
            background: '#D1FAE5',
            border: '1px solid #6EE7B7',
            color: '#065F46',
            padding: 6,
            borderRadius: 4,
            margin: '6px 0',
            fontSize: 12,
          }}
        >
          ✓ נשמר בסאמיט
        </div>
      )}

      <div className={styles.grid}>
        {renderRow('שם לקוח', 'Customers_FullName')}
        {renderRow('סוג לקוח', 'סוג לקוח', CLIENT_TYPE_OPTIONS)}
        {renderRow('ח.פ / ת.ז', 'Customers_CompanyNumber')}
        {renderRow('טלפון', 'Customers_Phone')}
        {renderRow('אימייל', 'Customers_EmailAddress')}
        {renderRow('תחום עיסוק', 'תחום עיסוק', BUSINESS_SECTOR_OPTIONS)}
        {renderRow('כתובת', 'Customers_Address')}
        {renderRow('יישוב', 'Customers_City')}
        {renderRow('מיקוד', 'Customers_ZipCode')}
        {renderRow('תאריך לידה', 'Customers_Birthdate')}
        {renderRow('מנהל תיק', 'מנהל תיק', ACCOUNT_MANAGER_OPTIONS)}
        {renderRow('מנהל/ת חשבונות', 'מנהל/ת חשבונות', AUDIT_WORKER_OPTIONS)}
      </div>

      {/* הערה מרכזית — full-width textarea, separate from the grid */}
      <div style={{ marginTop: 12 }}>
        <span className={styles.fieldLabel}>הערה מרכזית</span>
        <div style={{ marginTop: 4 }}>
          {!editing ? (
            <span className={draft.Customers_Text ? styles.fieldValue : `${styles.fieldValue} ${styles.empty}`}>
              {draft.Customers_Text || '—'}
            </span>
          ) : (
            <textarea
              value={draft.Customers_Text}
              onChange={(e) => setDraft({ ...draft, Customers_Text: e.target.value })}
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical' }}
              placeholder="טקסט קצר — לדוגמה: חשוב מאוד! / חבר של דני / כל פרט שכדאי לראות בקלות"
            />
          )}
        </div>
      </div>

      {/* BTL מיוצגים office-managed link (saves to Sanity, separate from Sumit). */}
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
