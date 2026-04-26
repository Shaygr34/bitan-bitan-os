'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import PipelineFunnel from './components/PipelineFunnel'
import ClientTable from './components/ClientTable'
import NewClientModal from './components/NewClientModal'
import CompletionDashboard from './CompletionDashboard'
import type { OnboardingRecord, PipelineClient } from '@/lib/onboarding/types'
import styles from './page.module.css'

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
  // Completion based on checklist only (docs checked on detail page)
  const checkedCount = (record.checklistItems || []).filter(i => i.completed).length
  const totalCount = (record.checklistItems || []).length
  const completionPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  // Missing column: show checklist-based status (not doc pills)
  const remaining = totalCount - checkedCount
  const missingDisplay: string[] = totalCount === 0
    ? []
    : remaining === 0
      ? []
      : [`${remaining} משימות`]

  return {
    ...record,
    currentStage: 1,
    completionPercent,
    missingDocs: missingDisplay,
    uploadedDocsCount: 0,
    requiredDocsCount: 0,
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

  const isCompleted = token.status === 'completed'

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
    completionPercent: 0,
    missingDocs: isCompleted ? ['לא מאומת'] : [token.status === 'opened' ? 'נפתח' : 'ממתין'],
    uploadedDocsCount: 0,
    requiredDocsCount: 0,
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
      const [recordsRes, tokensRes] = await Promise.all([
        fetch('/api/onboarding/records'),
        fetch('/api/intake/tokens'),
      ])

      const recordsData = recordsRes.ok ? await recordsRes.json() : { records: [] }
      const tokensData: IntakeToken[] = tokensRes.ok ? await tokensRes.json() : []

      const fetchedRecords: OnboardingRecord[] = recordsData.records || []

      // Build pipeline clients from onboarding records
      const fromRecords = fetchedRecords.map(buildPipelineClient)

      // Dedup legacy tokens: exclude those that have a matching onboardingRecord by token OR summitEntityId
      const recordTokens = new Set(fetchedRecords.map(r => r.intakeToken).filter(Boolean))
      const recordEntityIds = new Set(fetchedRecords.map(r => r.summitEntityId).filter(Boolean))
      const legacyTokens = tokensData.filter(t =>
        !recordTokens.has(t.token) && !(t.summitEntityId && recordEntityIds.has(t.summitEntityId))
      )
      const fromTokens = legacyTokens.map(tokenToPipelineClient)

      const allClients = [...fromRecords, ...fromTokens]
      setClients(allClients)

      // Compute funnel counts from the clients array (Issue 2)
      const computedCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
      for (const c of allClients) {
        const stage = c.currentStage || 0
        if (stage >= 1 && stage <= 6) computedCounts[stage]++
      }
      // Count stage 0 as stage 1 for display (they're in data collection)
      computedCounts[1] += allClients.filter(c => c.currentStage === 0).length
      setPipelineCounts(computedCounts)
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

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const handleDelete = async (clientId: string) => {
    // Optimistic: fade out immediately, no browser confirm
    setDeletingIds(prev => new Set(prev).add(clientId))

    // Determine the Sanity document ID
    const isLegacy = clientId.startsWith('token-')
    const sanityId = isLegacy ? `intakeToken-${clientId.replace('token-', '')}` : clientId

    try {
      const res = await fetch('/api/onboarding/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: sanityId }),
      })

      if (res.ok) {
        // Remove from state after brief animation
        setTimeout(() => {
          setClients(prev => prev.filter(c => c._id !== clientId))
          setDeletingIds(prev => {
            const next = new Set(prev)
            next.delete(clientId)
            return next
          })
        }, 300)
      } else {
        // Revert: show again
        setDeletingIds(prev => {
          const next = new Set(prev)
          next.delete(clientId)
          return next
        })
      }
    } catch {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(clientId)
        return next
      })
    }
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
                  onDelete={handleDelete}
                  deletingIds={deletingIds}
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
