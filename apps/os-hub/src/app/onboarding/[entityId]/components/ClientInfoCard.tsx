'use client'

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
}

export default function ClientInfoCard({ summitData, clientName, clientType, companyNumber }: Props) {
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

  return (
    <div className={styles.card}>
      <h3 className={styles.header}>פרטי לקוח</h3>
      <div className={styles.grid}>
        {fields.map((f) => (
          <div key={f.label} className={styles.field}>
            <span className={styles.fieldLabel}>{f.label}</span>
            <span className={f.value ? styles.fieldValue : `${styles.fieldValue} ${styles.empty}`}>
              {f.value || '\u2014'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
