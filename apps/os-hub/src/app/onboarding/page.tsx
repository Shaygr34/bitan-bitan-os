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

// Legacy intake token shape
interface IntakeToken {
  token: string
  status: string
  clientName?: string
  _createdAt: string
  summitEntityId?: string
  submittedData?: string
  prefillData?: string
  summitError?: string
}

function buildPipelineClient(record: OnboardingRecord): PipelineClient {
  const category = getDocCategory(record.clientType)
  const requiredDocs = REQUIRED_DOCS[category] || []
  const requiredDocsCount = requiredDocs.length

  // We don't fetch clientDocuments per record on the dashboard.
  // Show required docs as missing unless we have positive evidence they were uploaded.
  // Never show "הכל התקבל" by default — that requires verified uploads.
  const uploadedDocsCount = 0
  const missingDocs = requiredDocs.map((d) => DOC_LABELS[d] || d)

  const completionPercent = calculateCompletion(
    record.checklistItems || [],
    uploadedDocsCount,
    requiredDocsCount
  )

  return {
    ...record,
    currentStage: 1,
    completionPercent,
    missingDocs: missingDocs.length > 0 ? missingDocs : [],
    uploadedDocsCount,
    requiredDocsCount,
  }
}

/** Convert legacy intake tokens to PipelineClient for display */
function tokenToPipelineClient(token: IntakeToken): PipelineClient {
  let clientType = ''
  let manager = ''
  if (token.prefillData) {
    try {
      const pf = JSON.parse(token.prefillData)
      clientType = pf.clientType || ''
      manager = pf.manager || ''
    } catch { /* ignore */ }
  }

  // For completed tokens, we can't verify which docs were actually uploaded
  // without an onboardingRecord. Show "לא מאומת" (unverified) instead of empty (which implies all good).
  const isCompleted = token.status === 'completed'
  const category = getDocCategory(clientType)
  const requiredDocKeys = REQUIRED_DOCS[category] || []

  return {
    _id: `token-${token.token}`,
    _createdAt: token._createdAt,
    summitEntityId: token.summitEntityId,
    clientName: token.clientName || 'ללא שם',
    clientType,
    accountManager: manager,
    intakeToken: token.token,
    startDate: token._createdAt,
    checklistItems: [],
    currentStage: isCompleted ? 1 : 0,
    completionPercent: isCompleted ? 10 : 0,
    missingDocs: isCompleted ? ['לא מאומת'] : [token.status === 'opened' ? 'נפתח' : 'ממתין'],
    uploadedDocsCount: 0,
    requiredDocsCount: requiredDocKeys.length,
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
      const [recordsRes, pipelineRes, tokensRes] = await Promise.all([
        fetch('/api/onboarding/records'),
        fetch('/api/onboarding/pipeline'),
        fetch('/api/intake/tokens'),
      ])

      const recordsData = recordsRes.ok ? await recordsRes.json() : { records: [] }
      const pipelineData = pipelineRes.ok ? await pipelineRes.json() : { counts: {} }
      const tokensData: IntakeToken[] = tokensRes.ok ? await tokensRes.json() : []

      const fetchedRecords: OnboardingRecord[] = recordsData.records || []
      setPipelineCounts(pipelineData.counts || {})

      // Build pipeline clients from onboarding records
      const fromRecords = fetchedRecords.map(buildPipelineClient)

      // Build pipeline clients from legacy intake tokens (that don't have an onboarding record)
      const recordTokens = new Set(fetchedRecords.map(r => r.intakeToken).filter(Boolean))
      const legacyTokens = tokensData.filter(t => !recordTokens.has(t.token))
      const fromTokens = legacyTokens.map(tokenToPipelineClient)

      setClients([...fromRecords, ...fromTokens])
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
