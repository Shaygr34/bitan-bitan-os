import { STATUS_ID_TO_STAGE } from './types'

const BASE_URL = 'https://api.sumit.co.il'

function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
}

export async function getSummitEntity(entityId: string): Promise<Record<string, unknown> | null> {
  const creds = getCredentials()
  if (!creds.APIKey) return null
  try {
    const res = await fetch(`${BASE_URL}/crm/data/getentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({ Credentials: creds, EntityID: parseInt(entityId, 10), Folder: '557688522' }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    if (json.Status !== 0) return null
    return json.Data?.Entity ?? null
  } catch {
    return null
  }
}

export function extractStageFromEntity(entity: Record<string, unknown>): number {
  const status = entity['Customers_Status'] as Array<{ ID: number }> | undefined
  if (!status?.[0]?.ID) return 0
  return STATUS_ID_TO_STAGE[status[0].ID] ?? 0
}

export function extractClientData(entity: Record<string, unknown>) {
  return {
    phone: (entity['Customers_Phone'] as string[])?.[0] ?? '',
    email: (entity['Customers_EmailAddress'] as string[])?.[0] ?? '',
    sector: (entity['תחום עיסוק'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    address: (entity['Customers_Address'] as string[])?.[0] ?? '',
    clientType: (entity['סוג לקוח'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    accountManager: (entity['מנהל תיק'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    auditWorker: (entity['עובד/ת ביקורת'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
    bookkeeper: (entity['מנהל/ת חשבונות'] as Array<{ Name: string }>)?.[0]?.Name ?? '',
  }
}

/** Extract uploaded doc URLs from Summit הערות field */
export function extractDocUrls(entity: Record<string, unknown>): Record<string, string> {
  const notes = entity['הערות'] as Array<{ Item1?: string; Item2?: string }> | undefined
  const text = notes?.[0]?.Item2 || notes?.[0]?.Item1 || ''
  if (!text) return {}

  const docs: Record<string, string> = {}
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^(.+?):\s*(https:\/\/cdn\.sanity\.io\/.+)$/i)
    if (match) {
      const label = match[1].trim()
      const url = match[2].trim()
      // Map Hebrew label back to doc key
      if (label.includes('ת.ז')) docs.idCard = url
      else if (label.includes('רישיון')) docs.driverLicense = url
      else if (label.includes('ניהול חשבון') || label.includes('שיק')) docs.bankApproval = url
      else if (label.includes('עוסק מורשה')) docs.osekMurshe = url
      else if (label.includes('מע"מ') || label.includes('מעמ')) docs.ptihaTikMaam = url
      else if (label.includes('התאגדות')) docs.teudatHitagdut = url
      else if (label.includes('תקנון')) docs.takanonHevra = url
      else if (label.includes('מורשה חתימה') || label.includes('פרוטוקול')) docs.protokolMurshe = url
      else if (label.includes('נסח')) docs.nesahHevra = url
      else if (label.includes('שכירות')) docs.rentalContract = url
    }
  }
  return docs
}
