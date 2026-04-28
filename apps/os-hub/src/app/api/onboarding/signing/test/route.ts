import { NextResponse } from 'next/server'
import { getUserProfile, listTemplates, getMonthlyTaskCount } from '@/lib/onboarding/twosign-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/onboarding/signing/test — test 2Sign API connection.
 * Returns profile, templates, and monthly task count.
 * Remove this endpoint after confirming connection works.
 */
export async function GET() {
  const results: Record<string, unknown> = { ok: false }

  try {
    const profile = await getUserProfile()
    results.profile = profile
    results.authMethod = 'success'
  } catch (err) {
    results.profileError = err instanceof Error ? err.message : 'Unknown error'
  }

  try {
    const templates = await listTemplates()
    results.templates = templates
    results.templateCount = Array.isArray(templates) ? templates.length : 0
  } catch (err) {
    results.templatesError = err instanceof Error ? err.message : 'Unknown error'
  }

  try {
    const count = await getMonthlyTaskCount()
    results.monthlyTaskCount = count
  } catch (err) {
    results.taskCountError = err instanceof Error ? err.message : 'Unknown error'
  }

  results.ok = !results.profileError
  return NextResponse.json(results)
}
