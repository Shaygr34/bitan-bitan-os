'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import PipelineFunnel from './components/PipelineFunnel'
import ClientTable from './components/ClientTable'
import NewClientModal from './components/NewClientModal'
import CompletionDashboard from './CompletionDashboard'
import { calculateCompletion } from '@/lib/onboarding/completion'
import { getDocCategory, REQUIRED_DOCS } from '@/lib/onboarding/types'
import type { OnboardingRecord, PipelineClient } from '@/lib/onboarding/types'
import styles from './page.module.css'

// Doc label mapping for missing docs display
const DOC_LABELS: Record<string, string> = {
  idCard: 'ת.ז',
  driverLicense: 'רישיון',
  bankApproval: 'אישור בנק',
  teudatHitagdut: 'תעודת התאגדות',
}

function buildPipelineClient(record: OnboardingRecord): PipelineClient {
  const category = getDocCategory(record.clientType)
  const requiredDocs = REQUIRED_DOCS[category] || []

  // Count uploaded docs by checking checklist items with doc-related keys
  const uploadedDocs = requiredDocs.filter((docKey) =>
    record.checklistItems?.some((item) => item.key === docKey && item.completed)
  )

  const uploadedDocsCount = uploadedDocs.length
  const requiredDocsCount = requiredDocs.length
  const missingDocs = requiredDocs
    .filter((d) => !uploadedDocs.includes(d))
    .map((d) => DOC_LABELS[d] || d)

  const completionPercent = calculateCompletion(
    record.checklistItems || [],
    uploadedDocsCount,
    requiredDocsCount
  )

  return {
    ...record,
    currentStage: 1, // default — enriched from Summit below
    completionPercent,
    missingDocs,
    uploadedDocsCount,
    requiredDocsCount,
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'completion'>('dashboard')
  const [pipelineCounts, setPipelineCounts] = useState<Record<number, number>>({})
  const [stageFilter, setStageFilter] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<PipelineClient[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [recordsRes, pipelineRes] = await Promise.all([
        fetch('/api/onboarding/records'),
        fetch('/api/onboarding/pipeline'),
      ])

      const recordsData = recordsRes.ok ? await recordsRes.json() : { records: [] }
      const pipelineData = pipelineRes.ok ? await pipelineRes.json() : { counts: {} }

      const fetchedRecords: OnboardingRecord[] = recordsData.records || []
      setPipelineCounts(pipelineData.counts || {})

      // Build pipeline clients from Sanity data
      const pipelineClients = fetchedRecords.map(buildPipelineClient)
      setClients(pipelineClients)
    } catch {
      // Silently handle — table will show empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreated = () => {
    loadData()
  }

  const handleNavigate = (entityId: string) => {
    router.push(`/onboarding/${entityId}`)
  }

  // Filter clients by stage if filter is active
  const filteredClients = stageFilter
    ? clients.filter((c) => c.currentStage === stageFilter)
    : clients

  // Count clients not yet at stage 6 (active)
  const activeCount = clients.filter((c) => c.currentStage !== 6).length

  return (
    <div className="animate-page">
      <PageHeader
        title="קליטת לקוחות"
        description="ניהול תהליך הקליטה מאיסוף נתונים ועד לקוח פעיל"
      />

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab}${activeTab === 'dashboard' ? ` ${styles.tabActive}` : ''}`}
          onClick={() => setActiveTab('dashboard')}
          type="button"
        >
          לוח בקרה
        </button>
        <button
          className={`${styles.tab}${activeTab === 'completion' ? ` ${styles.tabActive}` : ''}`}
          onClick={() => setActiveTab('completion')}
          type="button"
        >
          השלמת נתונים
        </button>
      </div>

      {activeTab === 'completion' && <CompletionDashboard />}

      {activeTab === 'dashboard' && (
        <>
          {/* Top Bar */}
          <div className={styles.topBar}>
            <span className={styles.clientCount}>
              {activeCount} לקוחות בתהליך קליטה
            </span>
            <button
              className={styles.newClientBtn}
              onClick={() => setShowModal(true)}
              type="button"
            >
              + לקוח חדש
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className={styles.loadingBar}>
              <div className={styles.loadingBarInner} />
            </div>
          )}

          {/* Pipeline Funnel */}
          {!loading && (
            <>
              <div className={styles.funnelSection}>
                <PipelineFunnel
                  counts={pipelineCounts}
                  activeFilter={stageFilter}
                  onFilterStage={setStageFilter}
                />
              </div>

              {/* Client Table */}
              <div className={styles.tableSection}>
                <ClientTable
                  clients={filteredClients}
                  onNavigate={handleNavigate}
                />
              </div>
            </>
          )}

          {/* New Client Modal */}
          <NewClientModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            onCreated={handleCreated}
          />
        </>
      )}
    </div>
  )
}
