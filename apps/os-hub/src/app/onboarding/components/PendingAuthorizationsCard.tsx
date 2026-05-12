'use client'

import { useMemo } from 'react'
import type { PipelineClient } from '@/lib/onboarding/types'
import styles from './PendingAuthorizationsCard.module.css'

interface Props {
  clients: PipelineClient[]
  onNavigate: (entityId: string) => void
}

const DOC_TYPE_LABELS: Record<string, string> = {
  'poa-tax-authority': 'ייפוי כוח רשות המיסים',
  'poa-nii-withholdings': 'ב"ל ניכויים',
  'poa-nii-representatives': 'ב"ל מיוצגים',
}

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}ד'`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}ש'`
  const days = Math.floor(hours / 24)
  return `${days} ימים`
}

interface PendingRow {
  client: PipelineClient
  documentType: string
  completedAt?: string
}

export default function PendingAuthorizationsCard({ clients, onNavigate }: Props) {
  const rows = useMemo<PendingRow[]>(() => {
    const out: PendingRow[] = []
    for (const client of clients) {
      const tasks = client.signingTasks || []
      for (const task of tasks) {
        if (task.status === 'awaiting-office-authorize') {
          out.push({
            client,
            documentType: task.documentType,
            completedAt: task.completedAt,
          })
        }
      }
    }
    // Oldest waiting first — that's the one most likely to be forgotten.
    out.sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return ta - tb
    })
    return out
  }, [clients])

  if (rows.length === 0) return null

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>ממתין לאישור משרד</h3>
        <span className={styles.count}>{rows.length}</span>
      </div>
      <p className={styles.subtitle}>
        לקוחות שחתמו על ייפוי כוח — נדרשת לחיצה לאישור חתימת המשרד.
      </p>
      <ul className={styles.list}>
        {rows.map((row) => {
          const docLabel = DOC_TYPE_LABELS[row.documentType] || row.documentType
          const entityId = row.client.summitEntityId
          const waited = timeAgo(row.completedAt)
          return (
            <li key={`${row.client._id}-${row.documentType}`} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{row.client.clientName}</span>
                <span className={styles.rowDoc}>{docLabel}</span>
              </div>
              <div className={styles.rowMeta}>
                {waited && <span className={styles.rowWait}>ממתין {waited}</span>}
                <button
                  type="button"
                  className={styles.rowAction}
                  onClick={() => entityId && onNavigate(entityId)}
                  disabled={!entityId}
                  title={entityId ? 'פתיחת תיק הלקוח' : 'חסר מזהה Summit'}
                >
                  אשר
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
