'use client'

import styles from './DocumentsCard.module.css'

interface DocItem {
  docType: string
  label: string
  url?: string
}

interface Props {
  documents: DocItem[]
  uploadedCount: number
  requiredCount: number
}

const DOC_TYPE_LABELS: Record<string, string> = {
  idCard: '\u05E6\u05D9\u05DC\u05D5\u05DD \u05EA.\u05D6 + \u05E1\u05E4\u05D7',
  driverLicense: '\u05E6\u05D9\u05DC\u05D5\u05DD \u05E8\u05D9\u05E9\u05D9\u05D5\u05DF \u05E0\u05D4\u05D9\u05D2\u05D4',
  bankApproval: '\u05D0\u05D9\u05E9\u05D5\u05E8 \u05E0\u05D9\u05D4\u05D5\u05DC \u05D7\u05E9\u05D1\u05D5\u05DF',
  osekMurshe: '\u05EA\u05E2\u05D5\u05D3\u05EA \u05E2\u05D5\u05E1\u05E7 \u05DE\u05D5\u05E8\u05E9\u05D4',
  ptihaTikMaam: '\u05E4\u05EA\u05D9\u05D7\u05EA \u05EA\u05D9\u05E7 \u05DE\u05E2"\u05DE',
  teudatHitagdut: '\u05EA\u05E2\u05D5\u05D3\u05EA \u05D4\u05EA\u05D0\u05D2\u05D3\u05D5\u05EA',
  takanonHevra: '\u05EA\u05E7\u05E0\u05D5\u05DF \u05D7\u05D1\u05E8\u05D4',
  protokolMurshe: '\u05E4\u05E8\u05D5\u05D8\u05D5\u05E7\u05D5\u05DC \u05DE\u05D5\u05E8\u05E9\u05D4 \u05D7\u05EA\u05D9\u05DE\u05D4',
  nesahHevra: '\u05E0\u05E1\u05D7 \u05D7\u05D1\u05E8\u05D4',
  rentalContract: '\u05D7\u05D5\u05D6\u05D4 \u05E9\u05DB\u05D9\u05E8\u05D5\u05EA',
}

export default function DocumentsCard({ documents, uploadedCount, requiredCount }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>מסמכים</h3>
        <span className={styles.count}>{uploadedCount}/{requiredCount}</span>
      </div>
      <div className={styles.list}>
        {documents.map((doc) => {
          const isUploaded = !!doc.url
          const displayLabel = DOC_TYPE_LABELS[doc.docType] || doc.label

          return (
            <div key={doc.docType} className={styles.docRow}>
              <div className={`${styles.iconCircle} ${isUploaded ? styles.iconUploaded : styles.iconMissing}`}>
                {isUploaded ? '\u2713' : '!'}
              </div>
              <span className={isUploaded ? styles.docName : styles.docNameMissing}>
                {displayLabel}
              </span>
              {isUploaded && doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewLink}
                >
                  {'צפה \u2197'}
                </a>
              ) : (
                <span className={styles.missingBadge}>חסר</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
