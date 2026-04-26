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
  }
}
