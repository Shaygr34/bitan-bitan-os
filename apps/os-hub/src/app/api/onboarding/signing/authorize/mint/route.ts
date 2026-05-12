/**
 * POST /api/onboarding/signing/authorize/mint
 *
 * Body: { recordId: string, taskGuid: string }
 *
 * Server-mints an HMAC authorize token so an admin already in the OS UI
 * can trigger the same authorize POST without an email round-trip.
 *
 * Auth model for v1: this endpoint runs inside the OS hub which is already
 * an admin-only deployment (no public surface). No additional auth check.
 * If/when the OS hub starts hosting non-admin pages, gate this behind the
 * shared admin auth layer.
 */
import { NextResponse } from 'next/server'
import { signAuthorizeToken } from '@/lib/onboarding/authorize-token'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: { recordId?: string; taskGuid?: string }
  try {
    body = (await request.json()) as { recordId?: string; taskGuid?: string }
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { recordId, taskGuid } = body
  if (!recordId || !taskGuid) {
    return NextResponse.json({ error: 'recordId and taskGuid required' }, { status: 400 })
  }

  try {
    const token = signAuthorizeToken({ recordId, taskGuid })
    return NextResponse.json({ token })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mint failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
