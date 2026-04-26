import { type ChecklistItem } from './types'

export function calculateCompletion(
  checklistItems: ChecklistItem[],
  uploadedDocsCount: number,
  requiredDocsCount: number,
): number {
  const checkedCount = checklistItems.filter(i => i.completed).length
  const totalUnits = checklistItems.length + requiredDocsCount
  const completedUnits = checkedCount + uploadedDocsCount
  if (totalUnits === 0) return 0
  return Math.round((completedUnits / totalUnits) * 100)
}
