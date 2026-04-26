'use client'

import { Fragment, useState } from 'react'
import { PipelineClient, STAGE_LABELS, STAGE_COLORS } from '@/lib/onboarding/types'
import styles from './ClientTable.module.css'

interface Props {
  clients: PipelineClient[]
  onNavigate: (entityId: string) => void
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = String(d.getFullYear()).slice(-2)
  return `${day}.${month}.${year}`
}

function daysFromStart(dateStr?: string): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export default function ClientTable({ clients, onNavigate }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleRowClick = (client: PipelineClient) => {
    // Navigate to detail page if has Summit entity, otherwise just expand
    if (client.summitEntityId) {
      onNavigate(client.summitEntityId)
    } else {
      setExpandedId(expandedId === client._id ? null : client._id)
    }
  }

  const getPhone = (client: PipelineClient): string => {
    if (client.summitData?.phone) return client.summitData.phone
    // Fallback: try to extract from legacy token submittedData
    try {
      const sd = (client as unknown as Record<string, unknown>).submittedData // eslint-disable-line
      if (typeof sd === 'string') {
        const parsed = JSON.parse(sd)
        if (parsed.phone) return parsed.phone
      }
    } catch { /* ignore */ }
    return ''
  }

  const handleWhatsApp = (e: React.MouseEvent, client: PipelineClient) => {
    e.stopPropagation()
    const phone = getPhone(client)
    if (!phone) return
    const clean = phone.replace(/[-\s]/g, '').replace(/^0/, '972')
    window.open(`https://wa.me/${clean}`, '_blank')
  }

  const handleSummit = (e: React.MouseEvent, entityId?: string) => {
    e.stopPropagation()
    if (!entityId) return
    window.open(`https://app.sumit.co.il/f557688522/c${entityId}/`, '_blank')
  }

  const handleDetail = (e: React.MouseEvent, client: PipelineClient) => {
    e.stopPropagation()
    if (client.summitEntityId) {
      onNavigate(client.summitEntityId)
    }
  }

  if (clients.length === 0) {
    return <div className={styles.empty}>אין לקוחות להצגה</div>
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>לקוח</th>
            <th>שלב</th>
            <th>התקדמות</th>
            <th>תאריך התחלה</th>
            <th>חסר</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const isExpanded = expandedId === client._id
            const stageColor = STAGE_COLORS[client.currentStage] || '#999'
            const days = daysFromStart(client.startDate)

            return (
              <Fragment key={client._id}>
                <tr
                  className={styles.row}
                  style={{ '--row-stage-color': stageColor } as React.CSSProperties}
                  onClick={() => handleRowClick(client)}
                >
                  <td>
                    <div className={styles.clientName}>{client.clientName}</div>
                    <div className={styles.clientMeta}>
                      {client.clientType}{client.accountManager ? ` · ${client.accountManager}` : ''}
                    </div>
                  </td>
                  <td>
                    <span
                      className={styles.stagePill}
                      style={{ backgroundColor: stageColor }}
                    >
                      {STAGE_LABELS[client.currentStage] || `שלב ${client.currentStage}`}
                    </span>
                  </td>
                  <td>
                    <div className={styles.progressCell}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: `${client.completionPercent}%`,
                            backgroundColor: stageColor,
                          }}
                        />
                      </div>
                      <span className={styles.progressPercent}>{client.completionPercent}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.dateCell}>{formatDate(client.startDate)}</span>
                  </td>
                  <td>
                    <div className={styles.missingDocs}>
                      {client.missingDocs.length > 0 ? (
                        client.missingDocs.map((doc) => (
                          <span key={doc} className={styles.missingPill}>{doc}</span>
                        ))
                      ) : (
                        <span className={styles.allGood}>{'✓ הכל התקבל'}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className={styles.actionBtn}
                        onClick={(e) => handleWhatsApp(e, client)}
                        type="button"
                      >
                        WhatsApp
                      </button>
                      <button
                        className={styles.actionBtn}
                        onClick={(e) => handleSummit(e, client.summitEntityId)}
                        disabled={!client.summitEntityId}
                        type="button"
                      >
                        סאמיט
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.actionPrimary}`}
                        onClick={(e) => handleDetail(e, client)}
                        type="button"
                      >
                        פרטים
                      </button>
                    </div>
                  </td>
                </tr>
                <tr className={styles.detailRow}>
                  <td colSpan={6}>
                    <div className={`${styles.detailContent} ${isExpanded ? styles.detailExpanded : ''}`}>
                      <div className={styles.detailGrid}>
                        {client.summitData?.phone && (
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>טלפון:</span>
                            <span className={styles.detailValue}>{client.summitData.phone}</span>
                          </div>
                        )}
                        {client.summitData?.email && (
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>אימייל:</span>
                            <span className={styles.detailValue}>{client.summitData.email}</span>
                          </div>
                        )}
                        {client.summitData?.sector && (
                          <div className={styles.detailItem}>
                            <span className={styles.detailLabel}>תחום:</span>
                            <span className={styles.detailValue}>{client.summitData.sector}</span>
                          </div>
                        )}
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>מסמכים:</span>
                          <span className={styles.detailValue}>
                            {client.uploadedDocsCount}/{client.requiredDocsCount}
                          </span>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>ימים בתהליך:</span>
                          <span className={styles.detailValue}>{days}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

