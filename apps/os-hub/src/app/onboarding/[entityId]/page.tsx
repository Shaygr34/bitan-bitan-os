'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { OnboardingRecord, ChecklistItem } from '@/lib/onboarding/types'
import { STAGE_LABELS, REQUIRED_DOCS, getDocCategory } from '@/lib/onboarding/types'
import { calculateCompletion } from '@/lib/onboarding/completion'
import StageStepper from './components/StageStepper'
import ClientInfoCard from './components/ClientInfoCard'
import DocumentsCard from './components/DocumentsCard'
import ChecklistCard from './components/ChecklistCard'
import styles from './detail.module.css'

interface SummitData {
  phone?: string
  email?: string
  sector?: string
  address?: string
}

interface DocItem {
  docType: string
  label: string
  url?: string
}

interface PageState {
  loading: boolean
  error: string | null
  record: OnboardingRecord | null
  currentStage: number
  summitData: SummitData
  companyNumber: string
  documents: DocItem[]
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '\u2014'
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const entityId = params.entityId as string

  const [state, setState] = useState<PageState>({
    loading: true,
    error: null,
    record: null,
    currentStage: 0,
    summitData: {},
    companyNumber: '',
    documents: [],
  })

  const loadData = useCallback(async () => {
    try {
      // Fetch onboarding records and Summit entity in parallel
      const [recordsRes, entityRes] = await Promise.all([
        fetch('/api/onboarding/records'),
        fetch('/api/onboarding/entity?' + new URLSearchParams({ entityId })),
      ])

      // Parse onboarding record
      let record: OnboardingRecord | null = null
      if (recordsRes.ok) {
        const recordsData = await recordsRes.json() as { records: OnboardingRecord[] }
        record = recordsData.records?.find(
          (r) => r.summitEntityId === entityId
        ) || null
      }

      // Parse Summit entity data
      let currentStage = 0
      let summitData: SummitData = {}
      let companyNumber = ''
      let summitName = ''
      if (entityRes.ok) {
        const entityData = await entityRes.json() as {
          stage: number
          clientData: SummitData
          companyNumber?: string
          clientName?: string
        }
        currentStage = entityData.stage || 0
        summitData = entityData.clientData || {}
        companyNumber = entityData.companyNumber || ''
        summitName = entityData.clientName || ''
      }

      // If no onboarding record exists, create a minimal one from Summit data
      if (!record && summitName) {
        record = {
          _id: `summit-${entityId}`,
          _createdAt: new Date().toISOString(),
          summitEntityId: entityId,
          clientName: summitName,
          checklistItems: [],
        }
      }

      // Build document list based on client type
      const clientType = record?.clientType || ''
      const docCat = getDocCategory(clientType)
      const requiredKeys = REQUIRED_DOCS[docCat] || []

      // For now, build doc items from required docs -- no separate Sanity doc fetch needed
      // since uploaded docs are tracked through intake submissions
      const documents: DocItem[] = requiredKeys.map((key) => ({
        docType: key,
        label: key,
        url: undefined, // Will be populated when Sanity clientDocument schema is ready
      }))

      setState({
        loading: false,
        error: null,
        record,
        currentStage,
        summitData,
        companyNumber,
        documents,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      }))
    }
  }, [entityId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleChecklistToggle = async (itemKey: string, completed: boolean) => {
    if (!state.record) return

    // Optimistic update
    setState((prev) => {
      if (!prev.record) return prev
      const updatedItems = prev.record.checklistItems.map((item) =>
        item._key === itemKey
          ? { ...item, completed, completedAt: completed ? new Date().toISOString() : undefined }
          : item,
      )
      return {
        ...prev,
        record: { ...prev.record, checklistItems: updatedItems },
      }
    })

    // Persist to Sanity
    try {
      const res = await fetch('/api/onboarding/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: state.record._id,
          itemKey,
          completed,
        }),
      })
      if (!res.ok) {
        // Revert on failure
        loadData()
      }
    } catch {
      loadData()
    }
  }

  const handleWhatsApp = () => {
    const phone = state.summitData.phone?.replace(/[-\s]/g, '').replace(/^0/, '972')
    if (phone) {
      window.open(`https://wa.me/${phone}`, '_blank')
    }
  }

  const handleSummit = () => {
    window.open(`https://app.sumit.co.il/f557688522/c${entityId}/`, '_blank')
  }

  if (state.loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span className={styles.loadingText}>טוען נתוני לקוח...</span>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => router.push('/onboarding')}>
          {'\u2190 חזרה'}
        </button>
        <div className={styles.error}>{state.error}</div>
      </div>
    )
  }

  const record = state.record
  const checklistItems: ChecklistItem[] = record?.checklistItems || []
  const uploadedCount = state.documents.filter((d) => !!d.url).length
  const requiredCount = state.documents.length

  const completionPercent = calculateCompletion(checklistItems, uploadedCount, requiredCount)

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerSection}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => router.push('/onboarding')}>
            {'\u2190 חזרה'}
          </button>
          <h1 className={styles.clientName}>
            {record?.clientName || `לקוח #${entityId}`}
          </h1>
          <div className={styles.metaRow}>
            {record?.clientType && (
              <span className={styles.metaItem}>{record.clientType}</span>
            )}
            {record?.accountManager && (
              <span className={styles.metaItem}>
                {'מנהל תיק: '}{record.accountManager}
              </span>
            )}
            {record?.startDate && (
              <span className={styles.metaItem}>
                {'התחלה: '}{formatDate(record.startDate)}
              </span>
            )}
            {state.currentStage > 0 && (
              <span className={styles.metaItem}>
                {'שלב: '}{STAGE_LABELS[state.currentStage] || `${state.currentStage}`}
              </span>
            )}
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.actionBtn}
            onClick={handleWhatsApp}
            disabled={!state.summitData.phone}
            type="button"
          >
            WhatsApp
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleSummit}
            type="button"
          >
            Summit
          </button>
        </div>
      </div>

      {/* Stage Stepper */}
      <div className={styles.stepperSection}>
        <StageStepper
          currentStage={state.currentStage}
          completionPercent={completionPercent}
        />
      </div>

      {/* Two-column layout */}
      <div className={styles.columns}>
        <div className={styles.leftColumn}>
          <ClientInfoCard
            summitData={state.summitData}
            clientName={record?.clientName || ''}
            clientType={record?.clientType}
            companyNumber={state.companyNumber}
          />
          <DocumentsCard
            documents={state.documents}
            uploadedCount={uploadedCount}
            requiredCount={requiredCount}
          />
        </div>

        <div className={styles.rightColumn}>
          <ChecklistCard
            items={checklistItems}
            currentStage={state.currentStage}
            onToggle={handleChecklistToggle}
          />
        </div>
      </div>
    </div>
  )
}
