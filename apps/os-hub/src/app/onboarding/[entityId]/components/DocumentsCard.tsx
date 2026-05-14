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

export default function DocumentsCard({
  summitEntityId,
  documents,
  uploadedCount,
  requiredCount,
  signedDocs,
  onUploaded,
}: Props) {
  const hasSigned = !!signedDocs && signedDocs.length > 0
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

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
                <span
                  className={styles.viewLink}
                  style={{ cursor: 'default', color: '#6B7280', fontWeight: 500 }}
                  title="מאוחסן ישירות בשדה הקובץ בסאמיט — ניתן להוריד מתוך כרטיס הלקוח בסאמיט"
                >
                  {'מאוחסן בסאמיט'}
                </span>
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
