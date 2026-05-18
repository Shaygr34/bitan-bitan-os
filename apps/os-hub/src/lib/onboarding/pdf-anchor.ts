/**
 * PDF text-anchor resolver (server-side, pdfjs).
 *
 * Why this exists: the בקשת רישום (VAT-registration) form is variable-length
 * — §י (client) + §יא (Bitan) land on the LAST page, whose index shifts by
 * entity type and content. The legacy signing path (pdf-marker / auto-stamp)
 * hardcodes page 0 + fixed coords, which is correct only for the single-page
 * POAs. This module resolves a signature anchor by finding a section-heading
 * token sequence in the real PDF text, so placement tracks the actual form
 * regardless of pagination. Used only by `kind: 'anchored'` layouts; the
 * `kind: 'fixed'` forms never touch this code (zero regression by design).
 *
 * pdfjs notes: the Node-safe legacy build is resolved via the os-hub
 * node_modules (it ships with react-pdf). Hebrew text comes back as
 * whitespace-separated tokens, often in RTL visual order and split per word
 * ("הצהרת" / "העוסק" as two items on the same y-band) — so anchors are
 * matched as an unordered token SET sharing a y-band, never as a substring.
 */

import { createRequire } from 'node:module'

export interface AnchorSpec {
  /** Tokens that must all appear on the same y-band to identify the heading. */
  tokens: string[]
  /**
   * Which occurrence to take when the token-set repeats across the document
   * (e.g. "המייצג" appears on several pages). 'last' = the §יא heading on the
   * final page; 'first' = earliest. Default 'last'.
   */
  occurrence?: 'first' | 'last'
}

export interface ResolvedAnchor {
  /** 0-based page index the anchor heading was found on. */
  pageIndex: number
  pageWidth: number
  pageHeight: number
  /** Left-most x of the matched heading tokens (points from left). */
  anchorX: number
  /** y of the heading band, in points FROM TOP (matches form-layouts convention). */
  anchorYFromTop: number
}

const Y_BAND_TOLERANCE = 4 // pt — tokens within this Δy are "same line"

let _pdfjs: typeof import('pdfjs-dist') | null = null
async function getPdfjs() {
  if (_pdfjs) return _pdfjs
  const require = createRequire('/Users/shay/bitan-bitan-os/apps/os-hub/')
  const path = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  _pdfjs = (await import(path)) as typeof import('pdfjs-dist')
  return _pdfjs
}

interface Tok {
  str: string
  x: number
  yTop: number
}

/**
 * Resolve a heading anchor in a PDF.
 *
 * @throws if the anchor cannot be found — callers MUST treat this as a hard
 *         failure (never fall back to a guessed position on a legal filing).
 */
export async function resolveAnchor(
  pdfBuffer: Buffer,
  spec: AnchorSpec,
): Promise<ResolvedAnchor> {
  const pdfjs = await getPdfjs()
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise

  const occurrence = spec.occurrence ?? 'last'
  const wanted = spec.tokens.map((t) => t.trim()).filter(Boolean)
  const matches: ResolvedAnchor[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const toks: Tok[] = content.items
      // pdfjs TextItem has .str/.transform; TextMarkedContent does not.
      .flatMap((i) =>
        'str' in i && i.str.trim()
          ? [{ str: i.str.trim(), x: i.transform[4], yTop: vp.height - i.transform[5] }]
          : [],
      )

    // Group tokens into y-bands, then look for one band containing ALL wanted tokens.
    const bands = new Map<number, Tok[]>()
    for (const t of toks) {
      let key = [...bands.keys()].find((k) => Math.abs(k - t.yTop) <= Y_BAND_TOLERANCE)
      if (key === undefined) {
        key = t.yTop
        bands.set(key, [])
      }
      bands.get(key)!.push(t)
    }

    for (const [, band] of bands) {
      const hasAll = wanted.every((w) => band.some((b) => b.str.includes(w)))
      if (!hasAll) continue
      matches.push({
        pageIndex: p - 1,
        pageWidth: vp.width,
        pageHeight: vp.height,
        anchorX: Math.min(...band.map((b) => b.x)),
        anchorYFromTop: Math.min(...band.map((b) => b.yTop)),
      })
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `Anchor not found: tokens [${wanted.join(', ')}] do not co-occur on any line. ` +
        `Refusing to place a signature without a real anchor.`,
    )
  }
  return occurrence === 'first' ? matches[0] : matches[matches.length - 1]
}
