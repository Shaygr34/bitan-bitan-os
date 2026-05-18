/**
 * GET /api/onboarding/placement/pdf?url=<encoded>
 *
 * Same-origin PDF proxy for PlacementStudio's react-pdf <Document>. The PDFs
 * we place on are cross-origin (Sanity CDN, 2Sign) and the browser blocks a
 * direct cross-origin fetch — exactly the CORS issue RestampModal solved with
 * its /signing/pre-stamp-pdf proxy ("see #138"). PlacementStudio is generic
 * (any pdfUrl), so it needs a generic proxy.
 *
 * SSRF guard: only known document hosts are proxied (Sanity, 2Sign, the Bitan
 * Railway apps). Anything else is refused — this endpoint must never become an
 * open fetch-any-URL relay. A bounded timeout prevents a slow/dead source from
 * hanging the function (which surfaced client-side as a bare "Failed to fetch").
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_HOST_SUFFIXES = [
  '.sanity.io', // cdn.sanity.io etc. — uploadSignedPdfToSanity output
  'sanity.io',
  '.up.railway.app', // bitan-bitan-os / website
  '2sign.co.il',
  '.2sign.co.il',
  'comsign.co.il',
  '.comsign.co.il',
]

function hostAllowed(u: URL): boolean {
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  // Block private / loopback explicitly (defense in depth vs SSRF).
  if (h === 'localhost' || h.endsWith('.local') || /^(10\.|127\.|192\.168\.|169\.254\.|0\.)/.test(h))
    return false
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(s))
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url')
  if (!raw) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }
  if (!hostAllowed(target)) {
    return NextResponse.json(
      { error: `host not allowed: ${target.hostname}` },
      { status: 403 },
    )
  }

  try {
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    })
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: 502 },
      )
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed'
    // Timeout / network — return a clean error the UI can show instead of a
    // hung function manifesting as a bare "Failed to fetch".
    return NextResponse.json({ error: `proxy fetch failed: ${msg}` }, { status: 502 })
  }
}
