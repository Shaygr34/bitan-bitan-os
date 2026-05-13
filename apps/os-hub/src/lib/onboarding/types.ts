export interface ChecklistItem {
  _key: string
  key: string
  label: string
  completed: boolean
  completedAt?: string
  stageRelevance: number
}

export interface OnboardingRecord {
  _id: string
  _createdAt: string
  summitEntityId?: string
  clientName: string
  clientType?: string
  accountManager?: string
  intakeToken?: string
  startDate?: string
  checklistItems: ChecklistItem[]
  notes?: string
  cachedStage?: number
  cachedUploadedDocs?: number
  cachedRequiredDocs?: number
  lastSyncedAt?: string
  signingTasks?: SigningTask[]
}

export interface PipelineClient extends OnboardingRecord {
  currentStage: number
  completionPercent: number
  missingDocs: string[]
  uploadedDocsCount: number
  requiredDocsCount: number
  daysInStage?: number
  summitData?: {
    phone?: string
    email?: string
    sector?: string
    address?: string
  }
}

export const STAGE_LABELS: Record<number, string> = {
  1: 'איסוף נתונים',
  2: 'ייפוי כוח',
  3: 'אישור מנהל',
  4: 'רשויות',
  5: 'לקוח חדש',
  6: 'פעיל',
}

export const STAGE_COLORS: Record<number, string> = {
  1: '#3B82F6',
  2: '#F59E0B',
  3: '#10B981',
  4: '#8B5CF6',
  5: '#06B6D4',
  6: '#22C55E',
}

export const SUMMIT_STATUS_IDS: Record<number, number> = {
  1: 557688551,
  2: 557688550,
  3: 557688552,
  4: 1835410276,
  5: 1835414575,
  6: 557688549,
}

export const STATUS_ID_TO_STAGE: Record<number, number> = Object.fromEntries(
  Object.entries(SUMMIT_STATUS_IDS).map(([stage, id]) => [id, Number(stage)])
)

export const REQUIRED_DOCS: Record<string, string[]> = {
  individual: ['idCard', 'driverLicense', 'bankApproval'],
  company: ['idCard', 'driverLicense', 'bankApproval', 'teudatHitagdut'],
  exempt: ['idCard', 'driverLicense'],
}

// Signing task status — stored on onboardingRecord.signingTasks[]
// Supports both 2Sign tasks and external (ב"ל מיוצגים) tracking
export interface SigningTask {
  taskGuid: string           // 2Sign GUID, or 'external-{documentType}' for non-2Sign
  twoSignClientId: number    // 0 for external tasks
  documentType: string       // 'poa-tax-authority' | 'poa-nii-withholdings' | 'poa-nii-representatives'
  status: 'not-started' | 'pending' | 'sent' | 'awaiting-counter' | 'awaiting-office-authorize' | 'signed' | 'declined' | 'expired' | 'external-sent' | 'external-done'
  createdAt: string
  completedAt?: string
  signedDocUrl?: string
  /** Final stamped PDF (signed by client + auto office stamp + dates). Set by GET route after auto-stamp. */
  stampedDocUrl?: string
  externalRef?: string       // מספר אסמכתא for external tasks
  /** Form template key — used by auto-stamp routing. Persisted at POST time. */
  formType?: string
  /** ISO timestamp of last 2Sign status check (server cron or page poll). Audit trail for signing-poller. */
  lastPolledAt?: string
  /** ISO timestamp when notifySigningCompleted was fired. Prevents resend if a future poll re-detects 'signed'. */
  notifiedAt?: string
  /**
   * How many times the poller tried (and failed) to fetch the signed PDF artifact
   * after the 2Sign status flipped to 'signed'. Capped at 5 — beyond that the
   * task is considered permanently broken and surfaces in the operations log.
   * Once the artifact is successfully fetched, notifiedAt is stamped and this
   * counter stops mattering.
   */
  pdfFetchAttempts?: number
  /** Last error message from the PDF artifact fetch, for ops visibility. */
  pdfFetchLastError?: string
  /**
   * Audit trail for manual office overtake — set when the office bypassed the
   * normal flow by either uploading a pre-signed PDF or (future P2.b) re-stamping
   * with overridden coordinates. Always paired with a `manual-` prefixed taskGuid
   * or a regular taskGuid when the override superseded an in-flight 2Sign task.
   */
  manualOverride?: {
    kind: 'uploaded' | 'restamped'
    at: string                       // ISO timestamp
    /** taskGuid of the task that was superseded (when overriding an in-flight 2Sign task) */
    supersededTaskGuid?: string
    /** Pre-override stamped/signed URL (kept for audit) */
    originalSignedDocUrl?: string
  }
}

export function getDocCategory(clientType?: string): 'individual' | 'company' | 'exempt' {
  if (['חברה', 'חברה בע"מ', 'חברה שנתי', 'שותפות', 'עמותה'].includes(clientType || '')) return 'company'
  if (clientType === 'פטור' || clientType === 'עוסק פטור') return 'exempt'
  return 'individual'
}

// Office counter-signers — keyed by מנהל תיק name as it appears in Summit.
// Used to resolve which partner counter-signs a client's ייפוי כוח.
export interface OfficeSigner {
  name: string
  email: string
}

export const OFFICE_SIGNERS: Record<string, OfficeSigner> = {
  'אבי ביטן': { name: 'אבי ביטן — ביטן את ביטן רואי חשבון', email: 'avi@bitancpa.com' },
  'רון ביטן': { name: 'רון ביטן — ביטן את ביטן רואי חשבון', email: 'ron@bitancpa.com' },
}

const DEFAULT_OFFICE_SIGNER: OfficeSigner = OFFICE_SIGNERS['אבי ביטן']

/**
 * Resolve which office partner counter-signs based on the client's case manager.
 * Falls back to Avi if the case manager is missing or unrecognized.
 */
export function resolveOfficeSigner(caseManager?: string | null): OfficeSigner {
  if (!caseManager) return DEFAULT_OFFICE_SIGNER
  const normalized = caseManager.trim()
  return OFFICE_SIGNERS[normalized] || DEFAULT_OFFICE_SIGNER
}
