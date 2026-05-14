'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { OnboardingRecord, ChecklistItem, SigningTask } from '@/lib/onboarding/types'
import { STAGE_LABELS, REQUIRED_DOCS, getDocCategory } from '@/lib/onboarding/types'
import { calculateCompletion } from '@/lib/onboarding/completion'
import StageStepper from './components/StageStepper'
import ClientInfoCard from './components/ClientInfoCard'
import DocumentsCard from './components/DocumentsCard'
import ChecklistCard from './components/ChecklistCard'
import SigningCard from './components/SigningCard'
import { getSignedDocLabel } from '@/lib/onboarding/signed-doc-storage'
import styles from './detail.module.css'

interface SummitData {
  phone?: string
  email?: string
  sector?: string
  address?: string
  clientType?: string
  accountManager?: string
  auditWorker?: string
  bookkeeper?: string
  city?: string
  zipCode?: string
  birthdate?: string
  centralNote?: string
}

interface DocItem {
  docType: string
  label: string
  /** View URL — set when the doc is in הערות (linkable via Sanity CDN). */
  url?: string
  /**
   * Doc is stored in Summit's typed File field (downloadable from Sumit UI)
   * but no view-URL is available — Sumit stores it inline base64 and only
   * exposes it via its own /crm/downloadfile/ path which is auth-walled.
   * When true and `url` is also set, prefer the view link. When true alone,
   * render ✓ with a "מאוחסן בסאמיט" hint instead of "חסר".
   */
  inSummitFileField?: boolean
}

interface PageState {
  loading: boolean
  error: string | null
  record: OnboardingRecord | null
  currentStage: number
  summitData: SummitData
  companyNumber: string
  documents: DocItem[]
  signingTasks: SigningTask[]
  /** Historical "other" docs from Sumit's `קבצים אחרים` multi-file field. */
  otherDocs: { name: string }[]
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
    signingTasks: [],
    otherDocs: [],
  })

  const isPending = entityId.startsWith('pending-')
  const pendingToken = isPending ? entityId.replace('pending-', '') : ''

  const loadData = useCallback(async () => {
    try {
      // Pre-bounce path: client hasn't opened the intake link yet — load token data only.
      if (isPending) {
        const tokensRes = await fetch('/api/intake/tokens')
        const tokens = tokensRes.ok ? await tokensRes.json() : []
        const matching = Array.isArray(tokens) ? tokens.find((t: { token: string }) => t.token === pendingToken) : null
        let pendingName = ''
        let pendingType = ''
        let pendingManager = ''
        if (matching?.prefillData) {
          try {
            const pf = JSON.parse(matching.prefillData)
            pendingName = pf.clientName || ''
            pendingType = pf.clientType || ''
            pendingManager = pf.manager || ''
          } catch { /* ignore */ }
        }
        setState({
          loading: false,
          error: null,
          record: {
            _id: `pending-${pendingToken}`,
            _createdAt: matching?._createdAt || new Date().toISOString(),
            clientName: pendingName || matching?.clientName || 'לקוח חדש',
            clientType: pendingType,
            accountManager: pendingManager,
            intakeToken: pendingToken,
            startDate: matching?._createdAt,
            checklistItems: [],
          },
          currentStage: 0,
          summitData: { clientType: pendingType, accountManager: pendingManager },
          companyNumber: '',
          documents: [],
          signingTasks: [],
          otherDocs: [],
        })
        return
      }

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
      let docUrls: Record<string, string> = {}
      let typedDocsFilled: Record<string, boolean> = {}
      let otherDocs: { name: string }[] = []
      if (entityRes.ok) {
        const entityData = await entityRes.json() as {
          stage: number
          clientData: SummitData
          companyNumber?: string
          clientName?: string
          docUrls?: Record<string, string>
          typedDocsFilled?: Record<string, boolean>
          otherDocs?: { name: string }[]
        }
        currentStage = entityData.stage || 0
        summitData = entityData.clientData || {}
        companyNumber = entityData.companyNumber || ''
        summitName = entityData.clientName || ''
        docUrls = entityData.docUrls || {}
        typedDocsFilled = entityData.typedDocsFilled || {}
        otherDocs = entityData.otherDocs || []
      }

      // If no onboarding record exists, auto-create one in Sanity with checklist template
      if (!record && summitName) {
        try {
          const createRes = await fetch('/api/onboarding/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientName: summitName,
              clientType: summitData.clientType || '',
              accountManager: summitData.accountManager || '',
              summitEntityId: entityId,
            }),
          })
          if (createRes.ok) {
            const createData = await createRes.json() as { record: OnboardingRecord }
            record = createData.record
          }
        } catch {
          // Fallback to minimal record if creation fails
          record = {
            _id: `summit-${entityId}`,
            _createdAt: new Date().toISOString(),
            summitEntityId: entityId,
            clientName: summitName,
            checklistItems: [],
          }
        }
      }

      // Build document list based on client type, enriched with URLs from Summit הערות
      const clientType = summitData.clientType || record?.clientType || ''
      const docCat = getDocCategory(clientType)
      const requiredKeys = REQUIRED_DOCS[docCat] || []

      const documents: DocItem[] = requiredKeys.map((key) => ({
        docType: key,
        label: key,
        url: docUrls[key] || undefined,
        inSummitFileField: !!typedDocsFilled[key],
      }))

      // Fetch signing tasks (fire-and-forget refresh from 2Sign)
      let signingTasks: SigningTask[] = []
      try {
        const signingRes = await fetch('/api/onboarding/signing?' + new URLSearchParams({ summitEntityId: entityId }))
        if (signingRes.ok) {
          const signingData = await signingRes.json()
          signingTasks = signingData.tasks || []
        }
      } catch { /* non-fatal */ }

      setState({
        loading: false,
        error: null,
        record,
        currentStage,
        summitData,
        companyNumber,
        documents,
        signingTasks,
        otherDocs,
      })

      // Fire-and-forget: sync cached values to Sanity for dashboard use
      if (record?.summitEntityId || entityId) {
        const syncEntityId = record?.summitEntityId || entityId
        fetch('/api/onboarding/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summitEntityId: syncEntityId,
            stage: currentStage,
            uploadedDocs: documents.filter(d => !!d.url || !!d.inSummitFileField).length,
            requiredDocs: documents.length,
          }),
        }).catch(() => {}) // Silent — cache sync is best-effort
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      }))
    }
  }, [entityId, isPending, pendingToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Background poll while signing tasks are still non-terminal (sent/pending/awaiting-counter/external-sent).
  // Stops automatically once all tasks reach a terminal state.
  useEffect(() => {
    const TERMINAL = new Set(['signed', 'declined', 'expired', 'external-done'])
    const hasPending = state.signingTasks.some((t) => !TERMINAL.has(t.status))
    if (!hasPending) return
    const id = setInterval(() => {
      loadData()
    }, 30000)
    return () => clearInterval(id)
  }, [state.signingTasks, loadData])

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

  const handleChangeStage = async (targetStage: number) => {
    if (targetStage < 1 || targetStage > 6) return
    const targetLabel = STAGE_LABELS[targetStage] || `שלב ${targetStage}`
    const direction = targetStage > state.currentStage ? 'לקדם' : 'להחזיר'
    if (!confirm(`${direction} ל${targetLabel}?`)) return

    try {
      const res = await fetch('/api/onboarding/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, targetStage }),
      })
      if (res.ok) {
        loadData()
      } else {
        const data = await res.json().catch(() => ({})) // eslint-disable-line
        alert(`שגיאה: ${data.error || 'Unknown error'}`)
      }
    } catch {
      alert('שגיאה בעדכון שלב')
    }
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
  const uploadedCount = state.documents.filter((d) => !!d.url || !!d.inSummitFileField).length
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
            {record?.intakeToken && (
              <span className={styles.metaItem}>
                <a
                  href={`https://bitancpa.com/intake/${record.intakeToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--gold, #C5A572)', textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.preventDefault()
                    navigator.clipboard.writeText(`https://bitancpa.com/intake/${record.intakeToken}`)
                    const el = e.currentTarget
                    const orig = el.textContent
                    el.textContent = 'הועתק!'
                    setTimeout(() => { el.textContent = orig }, 1500)
                  }}
                >
                  {'קישור קליטה'}
                </a>
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
          {state.currentStage > 1 && (
            <button
              className={styles.actionBtn}
              onClick={() => handleChangeStage(state.currentStage - 1)}
              type="button"
            >
              {`\u2192 החזר שלב`}
            </button>
          )}
          {state.currentStage > 0 && state.currentStage < 6 && (
            <button
              className={`${styles.actionBtn} ${styles.advanceBtn}`}
              onClick={() => handleChangeStage(state.currentStage + 1)}
              type="button"
            >
              {`קדם שלב \u2190`}
            </button>
          )}
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
            summitEntityId={entityId}
            summitData={state.summitData}
            clientName={record?.clientName || ''}
            clientType={state.summitData.clientType || record?.clientType}
            companyNumber={state.companyNumber}
            recordId={record?._id}
            nationalInsuranceRepLink={record?.nationalInsuranceRepLink}
            onRecordUpdated={loadData}
          />
          <DocumentsCard
            summitEntityId={entityId}
            documents={state.documents}
            uploadedCount={uploadedCount}
            requiredCount={requiredCount}
            historicalOtherDocs={state.otherDocs}
            recordOtherDocs={record?.otherDocs}
            onUploaded={loadData}
            signedDocs={state.signingTasks
              .map((t) => {
                const url = t.stampedDocUrl || t.signedDocUrl
                if (!url) return null
                return {
                  documentType: t.documentType,
                  label: getSignedDocLabel(t.documentType),
                  url,
                }
              })
              .filter((x): x is { documentType: string; label: string; url: string } => x !== null)}
          />
          <SigningCard
            summitEntityId={entityId}
            recordId={record?._id}
            clientName={record?.clientName || ''}
            clientEmail={state.summitData.email || ''}
            clientPhone={state.summitData.phone || ''}
            clientIdNumber={state.companyNumber}
            clientType={state.summitData.clientType || record?.clientType}
            accountManager={record?.accountManager}
            currentStage={state.currentStage}
            tasks={state.signingTasks}
            onTasksChanged={loadData}
          />
        </div>

        <div className={styles.rightColumn}>
          <ChecklistCard
            items={checklistItems}
            currentStage={state.currentStage}
            onToggle={handleChecklistToggle}
            clientName={record?.clientName || ''}
            clientPhone={state.summitData.phone || ''}
          />
        </div>
      </div>
    </div>
  )
}
