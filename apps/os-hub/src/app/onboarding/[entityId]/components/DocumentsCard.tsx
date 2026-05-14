'use client'

import { useRef, useState } from 'react'
import styles from './DocumentsCard.module.css'

interface DocItem {
  docType: string
  label: string
  url?: string
  /** True when the typed Summit File field for this docType is populated. */
  inSummitFileField?: boolean
}

interface SignedDocItem {
  documentType: string
  label: string
  url: string
}

interface Props {
  summitEntityId: string
  documents: DocItem[]
  uploadedCount: number
  requiredCount: number
  signedDocs?: SignedDocItem[]
  /**
   * Historical "other" docs from Sumit's `קבצים אחרים` field.
   * Sumit OVERWRITES on each write — this field reflects only the latest
   * file present in CRM. Provided as a fallback signal for legacy data
   * uploaded before we started writing to Sanity. New uploads use
   * `recordOtherDocs` below.
   */
  historicalOtherDocs?: { name: string }[]
  /**
   * Canonical "other" docs list from the Sanity onboardingRecord. Source of
   * truth for what's been uploaded via the OS over time. Clickable Sanity
   * CDN URLs. Survives page reload. Replaces the session-local list for
   * any upload that completes via /api/onboarding/docs/upload (other path).
   */
  recordOtherDocs?: Array<{
    label?: string
    filename: string
    url: string
    uploadedAt: string
  }>
  /** Called after a successful office upload so the parent re-fetches. */
  onUploaded?: () => void
}

const DOC_TYPE_LABELS: Record<string, string> = {
  idCard: 'צילום ת.ז + ספח',
  driverLicense: 'צילום רישיון נהיגה',
  bankApproval: 'אישור ניהול חשבון',
  osekMurshe: 'תעודת עוסק מורשה',
  ptihaTikMaam: 'פתיחת תיק מע"מ',
  teudatHitagdut: 'תעודת התאגדות',
  takanonHevra: 'תקנון חברה',
  protokolMurshe: 'פרוטוקול מורשה חתימה',
  nesahHevra: 'נסח חברה',
  rentalContract: 'חוזה שכירות',
}

// Doc-types the office can upload from the OS (subset of all doc-types — only
// those the OS-side helper office-doc-storage.ts knows how to label).
const OFFICE_UPLOADABLE = new Set([
  'idCard',
  'driverLicense',
  'bankApproval',
  'osekMurshe',
  'ptihaTikMaam',
  'teudatHitagdut',
  'takanonHevra',
  'protokolMurshe',
  'nesahHevra',
  'rentalContract',
])

const ACCEPT_MIME = '.pdf,application/pdf,image/jpeg,image/png,image/webp,image/heic'

interface UploadedOtherDoc {
  label: string
  filename: string
  url: string
  uploadedAt: number
}

export default function DocumentsCard({
  summitEntityId,
  documents,
  uploadedCount,
  requiredCount,
  signedDocs,
  historicalOtherDocs,
  recordOtherDocs,
  onUploaded,
}: Props) {
  const hasSigned = !!signedDocs && signedDocs.length > 0
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Free-form "other" docs uploaded this session. Persisted to Sanity +
  // Summit's `קבצים אחרים` multi-file field server-side; on page reload they
  // disappear from this local list but partners can still find them in the
  // Summit client card (downloadable from CRM). Future iteration could
  // read-back from a typed-field response.
  const [otherDocs, setOtherDocs] = useState<UploadedOtherDoc[]>([])
  const [otherLabel, setOtherLabel] = useState('')
  const otherFileRef = useRef<HTMLInputElement | null>(null)

  const uploadDoc = async (docType: string, file: File) => {
    setUploadingFor(docType)
    setError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      // chunked base64 to avoid call-stack blowup on large files
      const bytes = new Uint8Array(arrayBuffer)
      const CHUNK = 0x8000
      let bin = ''
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
      }
      const base64 = btoa(bin)

      const res = await fetch('/api/onboarding/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          docType,
          fileBase64: base64,
          contentType: file.type || 'application/octet-stream',
          filename: file.name,
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `שגיאה: ${res.status}`)
      }

      onUploaded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setUploadingFor(null)
      const input = fileRefs.current[docType]
      if (input) input.value = ''
    }
  }

  const uploadOtherDoc = async (file: File) => {
    setUploadingFor('__other__')
    setError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      const CHUNK = 0x8000
      let bin = ''
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
      }
      const base64 = btoa(bin)

      const trimmedLabel = otherLabel.trim()
      const res = await fetch('/api/onboarding/docs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          docType: 'other',
          fileBase64: base64,
          contentType: file.type || 'application/octet-stream',
          filename: file.name,
          label: trimmedLabel || undefined,
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `שגיאה: ${res.status}`)
      }

      const data = (await res.json()) as { url?: string; label?: string | null }
      const newUrl = data.url
      if (newUrl) {
        setOtherDocs(prev => [
          ...prev,
          {
            label: trimmedLabel || data.label || 'מסמך נוסף',
            filename: file.name,
            url: newUrl,
            uploadedAt: Date.now(),
          },
        ])
      }
      setOtherLabel('')
      onUploaded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setUploadingFor(null)
      if (otherFileRef.current) otherFileRef.current.value = ''
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>מסמכים</h3>
        <span className={styles.count}>{uploadedCount}/{requiredCount}</span>
      </div>
      {error && (
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
          {error}
        </div>
      )}
      <div className={styles.list}>
        {documents.map((doc) => {
          const hasViewableUrl = !!doc.url
          const inSummit = !!doc.inSummitFileField
          // "Done" = visible-here OR known to live in Summit's typed File field.
          const isUploaded = hasViewableUrl || inSummit
          const displayLabel = DOC_TYPE_LABELS[doc.docType] || doc.label
          const canOfficeUpload = OFFICE_UPLOADABLE.has(doc.docType)
          const isUploadingThis = uploadingFor === doc.docType

          return (
            <div key={doc.docType} className={styles.docRow}>
              <div className={`${styles.iconCircle} ${isUploaded ? styles.iconUploaded : styles.iconMissing}`}>
                {isUploaded ? '✓' : '!'}
              </div>
              <span className={isUploaded ? styles.docName : styles.docNameMissing}>
                {displayLabel}
              </span>
              {hasViewableUrl ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewLink}
                >
                  {'צפה ↗'}
                </a>
              ) : inSummit ? (
                <>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#6B7280',
                      fontWeight: 500,
                      background: '#F3F4F6',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      marginInlineEnd: 6,
                    }}
                    title="מאוחסן ישירות בשדה הקובץ בסאמיט"
                  >
                    {'מאוחסן בסאמיט'}
                  </span>
                  {/* Proxy-served view link — fetches the typed Sumit File
                      field bytes via our server credentials (Sumit's
                      /crm/downloadfile/ is auth-walled for the browser). */}
                  <a
                    href={`/api/onboarding/docs/proxy?entityId=${encodeURIComponent(summitEntityId)}&docType=${encodeURIComponent(doc.docType)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewLink}
                  >
                    {'צפה ↗'}
                  </a>
                </>
              ) : (
                <span className={styles.missingBadge}>חסר</span>
              )}
              {canOfficeUpload && (
                <>
                  <input
                    ref={(el) => { fileRefs.current[doc.docType] = el }}
                    type="file"
                    accept={ACCEPT_MIME}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadDoc(doc.docType, file)
                    }}
                  />
                  <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, marginInlineStart: 8 }}>
                    <button
                      type="button"
                      onClick={() => fileRefs.current[doc.docType]?.click()}
                      disabled={isUploadingThis}
                      title={
                        isUploaded
                          ? 'החלף קובץ קיים — יישמר ב-Sanity, בשדה הקובץ הסומך, וכהערה בסאמיט'
                          : 'העלה קובץ מטעם המשרד — יישמר ב-Sanity, בשדה הקובץ הסומך, וכהערה בסאמיט'
                      }
                      style={{
                        padding: '2px 8px',
                        fontSize: 12,
                        border: '1px solid #D1D5DB',
                        background: '#fff',
                        borderRadius: 4,
                        cursor: isUploadingThis ? 'wait' : 'pointer',
                        color: '#374151',
                        minWidth: 80,
                      }}
                    >
                      {isUploadingThis ? '⏳ מעלה…' : isUploaded ? '⤴ החלף' : '⤴ העלה'}
                    </button>
                    {isUploadingThis && (
                      <div className={styles.uploadProgress} aria-label="מעלה קובץ" />
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Other docs — free-form uploads outside the rigid template.
          Canonical list lives in Sanity onboardingRecord.otherDocs (because
          Sumit's `קבצים אחרים` multi-file field overwrites on each write).
          The session-local `otherDocs` state is used for optimistic display
          before the parent re-fetches after upload. */}
      {(() => {
        // De-dupe: session-local entries that already made it into the
        // Sanity record (same uploadedAt as an entry returned by the server)
        // are filtered out so we don't render duplicates after refresh.
        const recordUrls = new Set((recordOtherDocs || []).map((d) => d.url))
        const sessionPending = otherDocs.filter((d) => !recordUrls.has(d.url))
        const totalCount = (recordOtherDocs?.length || 0) + sessionPending.length + (historicalOtherDocs?.length || 0)
        return (
          <>
            <div className={styles.headerRow} style={{ marginTop: '1.25rem' }}>
              <h3 className={styles.title} style={{ fontSize: '0.95rem' }}>{'מסמכים אחרים'}</h3>
              <span className={styles.count}>{totalCount}</span>
            </div>
            <div className={styles.list}>
              {/* Canonical Sanity-sourced other-docs. Clickable Sanity CDN. */}
              {(recordOtherDocs || []).map((d, i) => (
                <div key={`rec-other-${i}-${d.uploadedAt}`} className={styles.docRow}>
                  <div className={`${styles.iconCircle} ${styles.iconUploaded}`}>{'✓'}</div>
                  <span className={styles.docName}>{d.label || d.filename}</span>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewLink}
                  >
                    {'צפה ↗'}
                  </a>
                </div>
              ))}
              {/* Legacy: Sumit-derived. Only shows the LATEST due to multi-file
                  overwrite. Click lands in the Sumit client card. Empty in
                  practice for any record uploaded post-2026-05-14 since the
                  canonical list above covers it. */}
              {(historicalOtherDocs || []).map((d, i) => (
                <div key={`hist-other-${i}-${d.name}`} className={styles.docRow}>
                  <div className={`${styles.iconCircle} ${styles.iconUploaded}`}>{'✓'}</div>
                  <span className={styles.docName}>{d.name}</span>
                  <a
                    href={`https://app.sumit.co.il/f557688522/c${summitEntityId}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewLink}
                    title="פתח את כרטיס הלקוח בסאמיט — הקובץ זמין בשדה 'קבצים אחרים'"
                  >
                    {'פתח בסאמיט ↗'}
                  </a>
                </div>
              ))}
              {/* Optimistic session-local rows (not yet in Sanity record). */}
              {sessionPending.map((d) => (
                <div key={`other-${d.uploadedAt}`} className={styles.docRow}>
                  <div className={`${styles.iconCircle} ${styles.iconUploaded}`}>{'✓'}</div>
                  <span className={styles.docName}>{d.label}</span>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewLink}
                  >
                    {'צפה ↗'}
                  </a>
                </div>
              ))}
        <div className={styles.docRow} style={{ borderBottom: 'none', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            value={otherLabel}
            onChange={(e) => setOtherLabel(e.target.value)}
            placeholder="תיוג (למשל: 'אישור עבר נקי')"
            disabled={uploadingFor === '__other__'}
            style={{
              flex: 1,
              fontSize: 13,
              padding: '4px 8px',
              border: '1px solid #D1D5DB',
              borderRadius: 4,
              textAlign: 'right',
              direction: 'rtl',
              minWidth: 0,
            }}
          />
          <input
            ref={otherFileRef}
            type="file"
            accept={ACCEPT_MIME}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadOtherDoc(file)
            }}
          />
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              onClick={() => otherFileRef.current?.click()}
              disabled={uploadingFor === '__other__'}
              title="העלה מסמך חופשי שלא נכלל בתבנית — יישמר בסאמיט כקובץ נוסף"
              style={{
                padding: '4px 12px',
                fontSize: 12,
                border: '1px solid #1B2A4A',
                background: '#1B2A4A',
                color: '#fff',
                borderRadius: 4,
                cursor: uploadingFor === '__other__' ? 'wait' : 'pointer',
                minWidth: 110,
              }}
            >
              {uploadingFor === '__other__' ? '⏳ מעלה…' : '+ הוסף מסמך נוסף'}
            </button>
            {uploadingFor === '__other__' && (
              <div className={styles.uploadProgress} aria-label="מעלה קובץ" />
            )}
          </div>
        </div>
      </div>
          </>
        )
      })()}

      {hasSigned && (
        <>
          <div className={styles.headerRow} style={{ marginTop: '1.25rem' }}>
            <h3 className={styles.title} style={{ fontSize: '0.95rem' }}>{'מסמכים חתומים'}</h3>
            <span className={styles.count}>{signedDocs!.length}</span>
          </div>
          <div className={styles.list}>
            {signedDocs!.map((d) => (
              <div key={`signed-${d.documentType}`} className={styles.docRow}>
                <div className={`${styles.iconCircle} ${styles.iconUploaded}`}>{'✓'}</div>
                <span className={styles.docName}>{d.label}</span>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewLink}
                >
                  {'צפה ↗'}
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
