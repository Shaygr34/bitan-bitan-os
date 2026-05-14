'use client'

/**
 * RestampModal — Path B click-to-place coord override for the office
 * manual-overtake flow.
 *
 * Office workflow:
 *   1. Sees the pre-stamp PDF (just client-signed) rendered as a canvas.
 *   2. Clicks where the office stamp center should go (phase 1).
 *   3. Clicks where the office date baseline should go (phase 2).
 *   4. Reviews crosshair markers; clicks "אשר" → POST to /restamp.
 *
 * Coordinate translation:
 *   - The PDF page is rendered at a fixed PIXEL_WIDTH (~640px) so it fits in
 *     the modal. The render scale = PIXEL_WIDTH / pdfPageWidthInPoints.
 *   - A pixel click at (px, py) within the rendered page maps to PDF points
 *     at (px / scale, py / scale). Both x and yFromTop use page-top-down
 *     convention, matching FORM_LAYOUTS.
 *
 * Stamp anchor approximation:
 *   - applyOfficeStamp expects officeStamp.x = LEFT EDGE, yFromTop = TOP.
 *   - Office clicks the visual CENTER of where the stamp should land.
 *   - We translate center → top-left assuming widthPt from coord-default
 *     and a height = widthPt * STAMP_ASPECT_APPROX. The actual stamp aspect
 *     comes from the autograph PNG and is only known server-side at draw
 *     time, so this is a best-effort approximation — office can iterate.
 */

import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Worker setup — pin to react-pdf's bundled pdfjs version so the worker and
// the lib always match. Uses unpkg CDN; an offline office on a strict firewall
// would need to self-host this, but for a CPA office on standard internet it's
// fine.
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
}

const PIXEL_WIDTH = 640
/** Rough autograph aspect (h/w) — used only to draw a preview rectangle showing where the stamp will land. Final stamp aspect comes from the PNG server-side. */
const STAMP_ASPECT_APPROX = 0.5

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Pre-stamp PDF source. We DO NOT pass the raw Sanity CDN URL here anymore —
   * Sanity returns HTTP 403 on CORS preflight, which causes pdfjs's "Failed to
   * fetch" error. The component requests the PDF via the os-hub proxy route
   * (/api/onboarding/signing/pre-stamp-pdf) which fetches it server-side and
   * serves it same-origin. summitEntityId + documentType identify the task.
   */
  summitEntityId: string
  documentType: string
  /** Existing FORM_LAYOUTS office stamp width — used to draw preview rectangle */
  defaultStampWidthPt: number
  /** Existing FORM_LAYOUTS office date font size — used to draw preview line height */
  defaultDateFontSize: number
  onSuccess: () => void
}

type Phase = 'placing-stamp' | 'placing-date' | 'confirming'

interface PdfClick {
  /** PDF points from left of page */
  x: number
  /** PDF points from top of page */
  yFromTop: number
}

export default function RestampModal({
  open,
  onClose,
  summitEntityId,
  documentType,
  defaultStampWidthPt,
  defaultDateFontSize,
  onSuccess,
}: Props) {
  // Same-origin proxy URL — bypasses Sanity CDN CORS that was breaking
  // pdfjs's cross-origin fetch (HTTP 403 with Origin header set).
  const proxiedPdfUrl =
    `/api/onboarding/signing/pre-stamp-pdf?summitEntityId=${encodeURIComponent(summitEntityId)}` +
    `&documentType=${encodeURIComponent(documentType)}`
  const [phase, setPhase] = useState<Phase>('placing-stamp')
  const [stampCenter, setStampCenter] = useState<PdfClick | null>(null)
  const [dateBaseline, setDateBaseline] = useState<PdfClick | null>(null)
  const [pageWidthPt, setPageWidthPt] = useState<number | null>(null)
  const [pageHeightPt, setPageHeightPt] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setPhase('placing-stamp')
      setStampCenter(null)
      setDateBaseline(null)
      setError(null)
    }
  }, [open])

  if (!open) return null

  const scale = pageWidthPt ? PIXEL_WIDTH / pageWidthPt : 1

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current || !pageWidthPt) return
    const rect = overlayRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return

    const pdfClick: PdfClick = {
      x: px / scale,
      yFromTop: py / scale,
    }

    if (phase === 'placing-stamp') {
      setStampCenter(pdfClick)
      setPhase('placing-date')
    } else if (phase === 'placing-date') {
      setDateBaseline(pdfClick)
      setPhase('confirming')
    } else if (phase === 'confirming') {
      // Click during confirm phase = adjust last placement (date). Re-enter date phase.
      setDateBaseline(pdfClick)
    }
  }

  const handleReset = () => {
    setStampCenter(null)
    setDateBaseline(null)
    setPhase('placing-stamp')
  }

  const handleConfirm = async () => {
    if (!stampCenter || !dateBaseline) return
    setSubmitting(true)
    setError(null)
    try {
      // Translate stamp center → top-left for applyOfficeStamp's x/yFromTop convention.
      const stampHeightApprox = defaultStampWidthPt * STAMP_ASPECT_APPROX
      const stampX = stampCenter.x - defaultStampWidthPt / 2
      const stampYFromTop = stampCenter.yFromTop - stampHeightApprox / 2

      const res = await fetch('/api/onboarding/signing/restamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          documentType,
          coordOverrides: {
            officeStamp: {
              x: stampX,
              yFromTop: stampYFromTop,
            },
            officeDate: {
              x: dateBaseline.x,
              yFromTop: dateBaseline.yFromTop,
            },
          },
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
        if (res.status === 412 && data.code === 'NO_PRE_STAMP') {
          throw new Error('ה-PDF המקורי לא נשמר עבור משימה זו — השתמש בנתיב A (העלאת PDF חתום).')
        }
        throw new Error(data.error || 'שגיאה בכיוון מיקום')
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setSubmitting(false)
    }
  }

  // Visual overlays — drawn in PIXEL coords (so they sit correctly on the canvas).
  const stampPreviewRect = stampCenter
    ? {
        left: (stampCenter.x - defaultStampWidthPt / 2) * scale,
        top: (stampCenter.yFromTop - (defaultStampWidthPt * STAMP_ASPECT_APPROX) / 2) * scale,
        width: defaultStampWidthPt * scale,
        height: defaultStampWidthPt * STAMP_ASPECT_APPROX * scale,
      }
    : null

  const dateMarker = dateBaseline
    ? {
        left: dateBaseline.x * scale,
        top: dateBaseline.yFromTop * scale,
      }
    : null

  const instructionText =
    phase === 'placing-stamp'
      ? '1. לחץ במרכז המיקום הרצוי של חותמת המשרד'
      : phase === 'placing-date'
        ? '2. לחץ במיקום בסיס השורה של תאריך המשרד'
        : '3. בדוק את המיקומים. אם נכון — לחץ "אשר ושים חותמת". אם לא — "התחל מחדש"'

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 8,
          maxWidth: 760,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 16,
          direction: 'rtl',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1B2A4A' }}>
            🎯 כיוון מיקום החותמת — {documentType}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6B7280' }}
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: '#F3F4F6',
            border: '1px solid #E5E7EB',
            borderRadius: 4,
            padding: 8,
            marginBottom: 12,
            fontSize: 13,
            color: '#374151',
          }}
        >
          {instructionText}
        </div>

        {error && (
          <div
            style={{
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              padding: 8,
              borderRadius: 4,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair' }}>
          <Document
            file={proxiedPdfUrl}
            loading={
              <div
                style={{
                  width: PIXEL_WIDTH,
                  height: PIXEL_WIDTH * 1.41, // A4 aspect approx — placeholder while page loads
                  background: '#F3F4F6',
                  border: '1px dashed #D1D5DB',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  color: '#6B7280',
                  fontSize: 13,
                }}
              >
                <span>⏳ טוען PDF...</span>
                <span style={{ fontSize: 11 }}>הקובץ נמשך מסאמיט דרך פרוקסי OS</span>
              </div>
            }
            onLoadError={(err) => setError(`טעינת PDF נכשלה: ${err.message}`)}
          >
            <Page
              pageNumber={1}
              width={PIXEL_WIDTH}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onLoadSuccess={(pageInfo) => {
                // pageInfo.width / .height are in PDF POINTS (intrinsic).
                setPageWidthPt(pageInfo.width)
                setPageHeightPt(pageInfo.height)
              }}
            />
          </Document>

          {pageWidthPt && pageHeightPt && (
            <div
              ref={overlayRef}
              onClick={handleOverlayClick}
              style={{
                position: 'absolute',
                inset: 0,
                cursor: 'crosshair',
              }}
            >
              {stampPreviewRect && (
                <div
                  style={{
                    position: 'absolute',
                    left: stampPreviewRect.left,
                    top: stampPreviewRect.top,
                    width: stampPreviewRect.width,
                    height: stampPreviewRect.height,
                    background: 'rgba(197, 165, 114, 0.3)',
                    border: '2px dashed #C5A572',
                    pointerEvents: 'none',
                  }}
                  aria-label="תצוגת מיקום חותמת"
                />
              )}
              {dateMarker && (
                <div
                  style={{
                    position: 'absolute',
                    left: dateMarker.left,
                    top: dateMarker.top - 1,
                    width: defaultDateFontSize * scale * 5, // ~5 char baseline indicator
                    height: 2,
                    background: '#1B2A4A',
                    pointerEvents: 'none',
                  }}
                  aria-label="תצוגת בסיס תאריך"
                />
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={submitting || phase === 'placing-stamp'}
            style={{
              padding: '6px 12px',
              border: '1px solid #D1D5DB',
              background: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            התחל מחדש
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || phase !== 'confirming'}
            style={{
              padding: '6px 12px',
              border: '1px solid #1B2A4A',
              background: phase === 'confirming' ? '#1B2A4A' : '#9CA3AF',
              color: '#fff',
              borderRadius: 4,
              cursor: phase === 'confirming' ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'מכייל...' : 'אשר ושים חותמת'}
          </button>

          {phase !== 'placing-stamp' && (
            <span style={{ fontSize: 12, color: '#6B7280', marginInlineStart: 8 }}>
              {phase === 'placing-date' && 'חותמת מוקמת '}
              {phase === 'confirming' && 'חותמת + תאריך מוקמים — אפשר לאשר'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
