/**
 * Generic placement engine — bakes a PlacementSpec onto a PDF.
 *
 * This is the universal generalization of auto-stamp.ts + pdf-marker.ts:
 *   - MULTI-PAGE: every field is painted/marked on `field.pageIndex` (the
 *     core fix vs. the legacy page-0 hardcode).
 *   - SPEC-DRIVEN: any number of signature/stamp/date/text fields, not 4
 *     fixed elements.
 *   - SPLIT BY SIGNER: office fields are painted directly (pdf-lib, same
 *     technique as the proven auto-stamp.ts); client `signature` fields get
 *     an invisible 2Sign marker injected at the resolved spot so 2Sign places
 *     the drawable signature there (generalizes pdf-marker.ts to any page).
 *
 * Reuses the battle-tested auto-stamp recipes verbatim: Heebo TTF for Hebrew
 * (Helvetica throws on Hebrew code points), real embedded-PNG aspect for
 * center→top-left, manager autograph PNG via manager-stamps.ts.
 *
 * Additive + zero blast radius: the shipped POA path (auto-stamp/pdf-marker)
 * is untouched; this is a new engine the new pipeline calls.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getManagerStamp, type ManagerName } from './manager-stamps'
import type { PlacementSpec, PlacedField } from './placement-model'

const CLIENT_MARKER = '§§§§§§§§§§'
const MARKER_SIZE = 22

const HEEBO_TTF_URL = 'https://github.com/google/fonts/raw/main/ofl/heebo/Heebo%5Bwght%5D.ttf'
let cachedHebrewFontBytes: Uint8Array | null = null
async function getHebrewFontBytes(): Promise<Uint8Array | null> {
  if (cachedHebrewFontBytes) return cachedHebrewFontBytes
  try {
    const res = await fetch(HEEBO_TTF_URL)
    if (!res.ok) return null
    cachedHebrewFontBytes = new Uint8Array(await res.arrayBuffer())
    return cachedHebrewFontBytes
  } catch {
    return null
  }
}

const HEBREW_RE = /[֐-׿]/

/** 2Sign placement descriptor for an injected client-signature marker. */
export interface ClientMarkerPlacement {
  fieldId: string
  marker: string
  pageIndex: number
}

export interface ApplyPlacementOptions {
  /** Manager autograph for office signature/stamp fields. */
  manager: ManagerName
  /** Date string (dd/mm/yyyy) for date fields whose value is empty. */
  defaultDate?: string
}

export interface ApplyPlacementResult {
  pdfBuffer: Buffer
  /** Client-signature markers injected — feed these to the 2Sign task. */
  clientMarkers: ClientMarkerPlacement[]
  /** Office fields actually painted (audit). */
  painted: string[]
  /** Fields skipped with reason (e.g. page out of range) — never silently dropped. */
  skipped: { fieldId: string; reason: string }[]
}

function formatToday(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * Bake a PlacementSpec into a PDF. Never throws on a single bad field — it is
 * collected in `skipped` so the caller surfaces it to the office (the
 * graceful-degradation contract); only a corrupt PDF / asset throws.
 */
export async function applyPlacementSpec(
  pdfBuffer: Buffer,
  spec: PlacementSpec,
  options: ApplyPlacementOptions,
): Promise<ApplyPlacementResult> {
  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const pages = pdfDoc.getPages()
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const dateStr = options.defaultDate || formatToday()

  let hebrewFont: Awaited<ReturnType<typeof pdfDoc.embedFont>> | null = null
  async function ensureHebrew() {
    if (hebrewFont) return hebrewFont
    const bytes = await getHebrewFontBytes()
    if (!bytes) return null
    pdfDoc.registerFontkit(fontkit)
    hebrewFont = await pdfDoc.embedFont(bytes, { subset: true })
    return hebrewFont
  }

  const clientMarkers: ClientMarkerPlacement[] = []
  const painted: string[] = []
  const skipped: { fieldId: string; reason: string }[] = []

  for (const f of spec.fields) {
    if (f.pageIndex < 0 || f.pageIndex >= pages.length) {
      skipped.push({ fieldId: f.id, reason: `page ${f.pageIndex} out of range (0..${pages.length - 1})` })
      continue
    }
    const page = pages[f.pageIndex]
    const { height } = page.getSize()

    // CLIENT signature → inject invisible 2Sign marker at the spot (any page).
    if (f.kind === 'signature' && f.signer === 'client') {
      page.drawText(CLIENT_MARKER, {
        x: f.centerX - 30,
        y: height - f.centerYFromTop,
        size: MARKER_SIZE,
        font: helv,
        color: rgb(1, 1, 1),
        opacity: 0.01,
      })
      clientMarkers.push({ fieldId: f.id, marker: '§', pageIndex: f.pageIndex })
      continue
    }

    // OFFICE signature / stamp → paint manager autograph PNG, real aspect.
    if ((f.kind === 'signature' || f.kind === 'stamp') && f.signer === 'office') {
      const stamp = getManagerStamp(options.manager)
      const png = await pdfDoc.embedPng(stamp.png)
      const w = f.widthPt ?? 95
      const h = w * (png.height / png.width)
      page.drawImage(png, {
        x: f.centerX - w / 2,
        y: height - (f.centerYFromTop - h / 2) - h,
        width: w,
        height: h,
        opacity: 0.9,
      })
      painted.push(f.id)
      continue
    }

    // DATE / TEXT → paint string, Hebrew-aware, center→baseline.
    if (f.kind === 'date' || f.kind === 'text') {
      const text = f.value || (f.kind === 'date' ? dateStr : '')
      if (!text) {
        skipped.push({ fieldId: f.id, reason: 'empty text/date value' })
        continue
      }
      const size = f.fontSize ?? 11
      let font = helv
      if (HEBREW_RE.test(text)) {
        const hf = await ensureHebrew()
        if (!hf) {
          skipped.push({ fieldId: f.id, reason: 'Hebrew font unavailable' })
          continue
        }
        font = hf
      }
      const tw = font.widthOfTextAtSize(text, size)
      page.drawText(text, {
        x: f.centerX - tw / 2,
        y: height - f.centerYFromTop,
        size,
        font,
        color: rgb(0, 0, 0),
      })
      painted.push(f.id)
      continue
    }

    skipped.push({ fieldId: f.id, reason: `unhandled kind/signer: ${f.kind}/${f.signer}` })
  }

  const out = await pdfDoc.save()
  return { pdfBuffer: Buffer.from(out), clientMarkers, painted, skipped }
}
