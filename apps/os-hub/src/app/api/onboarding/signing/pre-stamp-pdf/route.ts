/**
 * GET /api/onboarding/signing/pre-stamp-pdf?summitEntityId=X&documentType=Y
 *
 * Proxies the pre-stamp signed PDF from Sanity CDN through the os-hub server.
 *
 * Why: Sanity CDN returns HTTP 403 on CORS preflight (cross-origin browser
 * fetch) for assets in this project, even though direct GET works. pdfjs
 * (used by RestampModal for the click-to-place coord override) fetches the
 * PDF via JS, which triggers CORS, which Sanity rejects. The browser surfaces
 * this as "Failed to fetch". Running the fetch server-side bypasses CORS
 * because the os-hub→Sanity hop has no Origin header constraint.
 *
 * Auth: trusts the OS session (this route is only reachable from within the
 * onboarding/[entityId] page, no public exposure expected). If we later add
 * a public auth-gate flow that needs preStampDocUrl, add a token check here.
 */

import { NextResponse } from 'next/server'
import { query } from '@/lib/sanity/client'
import type { OnboardingRecord, SigningTask } from '@/lib/onboarding/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const summitEntityId = searchParams.get('summitEntityId')
  const documentType = searchParams.get('documentType')

  if (!summitEntityId || !documentType) {
    return NextResponse.json(
      { error: 'summitEntityId and documentType are required' },
      { status: 400 },
    )
  }

  try {
    const records = await query<OnboardingRecord[]>(
      `*[_type == "onboardingRecord" && summitEntityId == $eid][0..0]{ signingTasks }`,
      { eid: summitEntityId },
    )
    const record = records?.[0]
    if (!record) {
      return NextResponse.json({ error: 'Onboarding record not found' }, { status: 404 })
    }

    const tasks: SigningTask[] = record.signingTasks || []
    const target = tasks.find((t) => t.documentType === documentType)
    if (!target) {
      return NextResponse.json({ error: 'Task not found for documentType' }, { status: 404 })
    }
    if (!target.preStampDocUrl) {
      return NextResponse.json(
        { error: 'Pre-stamp PDF not preserved for this task', code: 'NO_PRE_STAMP' },
        { status: 412 },
      )
    }

    // Server-side fetch — no Origin header, so Sanity's CORS-gating returns 200.
    const upstream = await fetch(target.preStampDocUrl)
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed: HTTP ${upstream.status}` },
        { status: 502 },
      )
    }
    const buffer = Buffer.from(await upstream.arrayBuffer())

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
