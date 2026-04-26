import { NextResponse } from 'next/server'
import { getSummitEntity, extractStageFromEntity, extractClientData, extractDocUrls } from '@/lib/onboarding/summit-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/onboarding/entity?entityId=123
 * Returns stage, client data, and company number for a Summit entity.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId')

  if (!entityId) {
    return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
  }

  try {
    const entity = await getSummitEntity(entityId)

    if (!entity) {
      return NextResponse.json({
        stage: 0,
        clientData: {},
        companyNumber: '',
        clientName: '',
        docUrls: {},
      })
    }

    const stage = extractStageFromEntity(entity)
    const clientData = extractClientData(entity)
    const companyNumber = (entity['Customers_CompanyNumber'] as string[])?.[0] || ''
    const clientName = (entity['Customers_FullName'] as string[])?.[0] || ''
    const docUrls = extractDocUrls(entity)

    return NextResponse.json({
      stage,
      clientData,
      companyNumber,
      clientName,
      docUrls,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
