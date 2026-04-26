'use client'

import { STAGE_LABELS, STAGE_COLORS } from '@/lib/onboarding/types'
import styles from './PipelineFunnel.module.css'

interface Props {
  counts: Record<number, number>
  activeFilter: number | null
  onFilterStage: (stage: number | null) => void
}

const STAGES = [1, 2, 3, 4, 5, 6]

export default function PipelineFunnel({ counts, activeFilter, onFilterStage }: Props) {
  return (
    <div className={styles.strip}>
      {STAGES.map((stage) => {
        const isActive = activeFilter === stage
        return (
          <button
            key={stage}
            className={`${styles.card} ${isActive ? styles.active : ''}`}
            style={{ borderBottomColor: STAGE_COLORS[stage], borderBottomWidth: 3 }}
            onClick={() => onFilterStage(isActive ? null : stage)}
            type="button"
          >
            <div className={`${styles.count} ${stage === 6 ? styles.countGold : ''}`}>
              {counts[stage] ?? 0}
            </div>
            <div className={styles.label}>{STAGE_LABELS[stage]}</div>
          </button>
        )
      })}
    </div>
  )
}
