'use client'

import type { ChecklistItem } from '@/lib/onboarding/types'
import styles from './ChecklistCard.module.css'

interface Props {
  items: ChecklistItem[]
  currentStage: number
  onToggle: (itemKey: string, completed: boolean) => void
}

export default function ChecklistCard({ items, currentStage, onToggle }: Props) {
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
