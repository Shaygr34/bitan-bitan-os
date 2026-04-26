import { NextResponse } from 'next/server'
import { SUMMIT_STATUS_IDS } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE_URL = 'https://api.sumit.co.il'
const CLIENTS_FOLDER = '557688522'

function getCredentials() {
  return {
    CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
    APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
  }
}

async function countEntitiesForStatus(statusId: number): Promise<number> {
  const creds = getCredentials()
  if (!creds.APIKey) return 0

  try {
    const res = await fetch(`${BASE_URL}/crm/data/listentities/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        Folder: CLIENTS_FOLDER,
        Filters: [
          {
            Field: 'Customers_Status',
            Operator: 0, // equals
            Value: String(statusId),
          },
        ],
        Page: 1,
        PageSize: 1,
      }),
      cache: 'no-store',
    })

    if (!res.ok) return 0
    const json = await res.json()
    if (json.Status !== 0) return 0
    return json.Data?.TotalItems ?? 0
  } catch {
    return 0
  }
}

/**
 * GET /api/onboarding/pipeline — pipeline stage counts from Summit.
 */
export async function GET() {
  try {
    const counts: Record<number, number> = {}

    // Fetch counts for all 6 stages in parallel
    const entries = Object.entries(SUMMIT_STATUS_IDS)
    const results = await Promise.all(
      entries.map(([, statusId]) => countEntitiesForStatus(statusId))
    )

    entries.forEach(([stage], idx) => {
      counts[Number(stage)] = results[idx]
    })

    return NextResponse.json({ counts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
