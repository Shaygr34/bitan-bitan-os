'use client'

import { STAGE_LABELS } from '@/lib/onboarding/types'
import styles from './StageStepper.module.css'

interface Props {
  currentStage: number
  completionPercent: number
}

const STAGES = [1, 2, 3, 4, 5, 6]

export default function StageStepper({ currentStage, completionPercent }: Props) {
  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.label}>התקדמות</span>
        <span className={styles.percent}>{completionPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      {/* 6-dot stepper */}
      <div className={styles.stepper}>
        {/* Connecting lines */}
        <div className={styles.lineTrack}>
          {STAGES.slice(0, -1).map((stage) => (
            <div
              key={`line-${stage}`}
              className={styles.lineSegment}
              style={{
                background: stage < currentStage
                  ? 'var(--brand-gold)'
                  : 'var(--border)',
              }}
            />
          ))}
        </div>

        {/* Dots */}
        {STAGES.map((stage) => {
          const isCompleted = stage < currentStage
          const isCurrent = stage === currentStage
          const labelColor = isCompleted
            ? 'var(--brand-gold)'
            : isCurrent
              ? '#F59E0B'
              : 'var(--text-caption)'

          return (
            <div key={stage} className={styles.step}>
              <div
                className={`${styles.dot} ${
                  isCompleted
                    ? styles.dotCompleted
                    : isCurrent
                      ? styles.dotCurrent
                      : styles.dotFuture
                }`}
              >
                {isCompleted ? '\u2713' : stage}
              </div>
              <span
                className={styles.stepLabel}
                style={{ color: labelColor }}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
