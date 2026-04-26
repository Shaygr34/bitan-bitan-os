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

export function getDocCategory(clientType?: string): 'individual' | 'company' | 'exempt' {
  if (['חברה', 'חברה בע"מ', 'חברה שנתי', 'שותפות', 'עמותה'].includes(clientType || '')) return 'company'
  if (clientType === 'פטור' || clientType === 'עוסק פטור') return 'exempt'
  return 'individual'
}
