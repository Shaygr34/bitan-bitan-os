/**
 * GET /api/onboarding/stamps/[name]
 *
 * Serves the manager autograph PNG. The actual PNG bytes live inline in
 * `lib/onboarding/manager-stamps.ts` as base64 constants — we decode and
 * stream them so the RestampModal's draggable overlay can show the REAL
 * stamp image instead of a gold placeholder box.
 *
 * Param: name = 'avi' | 'ron' (ManagerName from manager-stamps).
 */

import { NextResponse } from 'next/server'
import { getManagerStamp, type ManagerName } from '@/lib/onboarding/manager-stamps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  if (name !== 'avi' && name !== 'ron') {
    return NextResponse.json({ error: 'Unknown stamp' }, { status: 404 })
  }
  try {
    const stamp = getManagerStamp(name as ManagerName)
    return new NextResponse(new Uint8Array(stamp.png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(stamp.png.byteLength),
        // Manager autographs change rarely; cache for an hour on the edge.
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
