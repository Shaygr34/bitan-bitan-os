'use client'

import { useState } from 'react'
import type { ChecklistItem } from '@/lib/onboarding/types'
import { getKodeiMosadLetter, buildWhatsAppUrl } from '@/lib/onboarding/letter-templates'
import styles from './ChecklistCard.module.css'

interface Props {
  items: ChecklistItem[]
  currentStage: number
  onToggle: (itemKey: string, completed: boolean) => void
  clientName?: string
  clientPhone?: string
}

export default function ChecklistCard({ items, currentStage, onToggle, clientName, clientPhone }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopyKodeiMosad = async () => {
    const text = getKodeiMosadLetter(clientName || '')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey('send-codes')
      setTimeout(() => setCopiedKey(null), 1800)
    } catch {
      // Clipboard blocked — fallback: open WhatsApp instead
      window.open(buildWhatsAppUrl(text, clientPhone), '_blank')
    }
  }

  const handleWhatsAppKodeiMosad = () => {
    const text = getKodeiMosadLetter(clientName || '')
    window.open(buildWhatsAppUrl(text, clientPhone), '_blank')
  }

  const completedCount = items.filter((i) => i.completed).length
  const totalCount = items.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>{"צ'קליסט קליטה"}</h3>
        <span className={styles.count}>{completedCount}/{totalCount}</span>
      </div>

      <div className={styles.miniProgress}>
        <div
          className={styles.miniProgressFill}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className={styles.items}>
        {items.map((item) => {
          const isCurrent = item.stageRelevance === currentStage
          const isFuture = item.stageRelevance > currentStage
          const isCompleted = item.completed

          let itemClass = styles.item
          if (isCurrent && !isCompleted) itemClass += ` ${styles.itemCurrent}`
          if (isFuture && !isCompleted) itemClass += ` ${styles.itemFuture}`

          let labelClass = styles.itemLabel
          if (isCompleted) {
            labelClass += ` ${styles.itemLabelCompleted}`
          } else if (isCurrent) {
            labelClass += ` ${styles.itemLabelCurrent}`
          }

          const isSendCodes = item._key === 'send-codes'

          return (
            <div key={item._key} className={itemClass}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isCompleted}
                disabled={isFuture && !isCompleted}
                onChange={() => onToggle(item._key, !isCompleted)}
              />
              <span
                className={labelClass}
                onClick={() => {
                  if (!(isFuture && !isCompleted)) {
                    onToggle(item._key, !isCompleted)
                  }
                }}
              >
                {item.label}
              </span>
              {isSendCodes && !(isFuture && !isCompleted) && (
                <span className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={(e) => { e.stopPropagation(); handleCopyKodeiMosad() }}
                    title="העתק מכתב קודי מוסד ללוח"
                  >
                    {copiedKey === 'send-codes' ? 'הועתק' : 'העתק'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={(e) => { e.stopPropagation(); handleWhatsAppKodeiMosad() }}
                    title="פתח WhatsApp עם המכתב"
                  >
                    WhatsApp
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
