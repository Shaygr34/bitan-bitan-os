'use client'

/**
 * RestampModal v2 — drag-based visual placement of all 4 stamp elements.
 *
 * v1 was click-to-place for 2 elements (stamp + office date) with center-
 * approximated math. Shay 2026-05-14 feedback: too imprecise ("actually
 * does it more down"), missing 2 elements (client date, firm name), and
 * UI felt wonky. v2 follows the world-class pattern from DocuSign /
 * HelloSign / SignNow: render the live PDF, overlay each placement element
 * as a real-content draggable div, let the office drag any of them. Send
 * the final coords to the /restamp route.
 *
 * What's draggable:
 *   1. 🖋 Office stamp — actual manager autograph PNG sized to widthPt
 *   2. 📅 Office date — actual date string in same font size as final
 *   3. 🏢 Office firm name — "ביטן את ביטן רואי חשבון" in render font
 *   4. 📅 Client date — same date string (for the alsoFillClientDate path)
 *
 * Inaccuracy fix: each element sends CENTER coords (centerX/centerY) instead
 * of top-left. The backend computes top-left after embedding the PNG and
 * reading the real aspect, eliminating the drift v1 had from a hardcoded
 * 0.5 aspect approximation.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
}

const PIXEL_WIDTH = 720

interface ElementDefaults {
  /** Initial center coords in PDF points (yFromTop). */
  centerX: number
  centerY: number
  /** Stamp width in PDF points (image elements only). */
  widthPt?: number
  /** Approximate aspect ratio for the preview box (image elements only). */
  aspectApprox?: number
  /** Text content (text elements only). */
  text?: string
  fontSize?: number
}

interface Props {
  open: boolean
  onClose: () => void
  summitEntityId: string
  documentType: string
  /** FORM_LAYOUTS defaults — used to seed the initial element positions. */
  defaults: {
    officeStamp: { x: number; yFromTop: number; widthPt: number }
    officeDate: { x: number; yFromTop: number; fontSize: number }
    officeFirmName: { x: number; yFromTop: number; fontSize: number; text: string }
    clientDate: { x: number; yFromTop: number; fontSize: number }
  }
  /** Manager autograph PNG URL for the live preview overlay. */
  managerStampUrl?: string
  /** Date string to render as preview (typically today, dd/mm/yyyy). */
  previewDateStr: string
  onSuccess: () => void
}

type ElementId = 'officeStamp' | 'officeDate' | 'officeFirmName' | 'clientDate'

interface ElementState {
  centerX: number
  centerY: number
}

export default function RestampModal({
  open,
  onClose,
  summitEntityId,
  documentType,
  defaults,
  managerStampUrl,
  previewDateStr,
  onSuccess,
}: Props) {
  // Same-origin proxy URL for the pre-stamp PDF (CORS workaround — see #138).
  const proxiedPdfUrl =
    `/api/onboarding/signing/pre-stamp-pdf?summitEntityId=${encodeURIComponent(summitEntityId)}` +
    `&documentType=${encodeURIComponent(documentType)}`

  // Convert top-left FORM_LAYOUTS defaults → center coords for the draggable
  // overlays. Approximations on aspect/textWidth are fine here — the BACKEND
  // does the precise math on apply using real PNG aspect + real font metrics.
  const initialState = useCallback((): Record<ElementId, ElementState> => ({
    officeStamp: {
      centerX: defaults.officeStamp.x + defaults.officeStamp.widthPt / 2,
      centerY: defaults.officeStamp.yFromTop + (defaults.officeStamp.widthPt * 0.5) / 2,
    },
    officeDate: {
      centerX: defaults.officeDate.x + (previewDateStr.length * defaults.officeDate.fontSize * 0.55) / 2,
      centerY: defaults.officeDate.yFromTop - defaults.officeDate.fontSize * 0.35,
    },
    officeFirmName: {
      centerX: defaults.officeFirmName.x + (defaults.officeFirmName.text.length * defaults.officeFirmName.fontSize * 0.5) / 2,
      centerY: defaults.officeFirmName.yFromTop - defaults.officeFirmName.fontSize * 0.35,
    },
    clientDate: {
      centerX: defaults.clientDate.x + (previewDateStr.length * defaults.clientDate.fontSize * 0.55) / 2,
      centerY: defaults.clientDate.yFromTop - defaults.clientDate.fontSize * 0.35,
    },
  }), [defaults, previewDateStr])

  const [elements, setElements] = useState<Record<ElementId, ElementState>>(initialState)
  const [pageWidthPt, setPageWidthPt] = useState<number | null>(null)
  const [pageHeightPt, setPageHeightPt] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const scale = pageWidthPt ? PIXEL_WIDTH / pageWidthPt : 1

  // Drag bookkeeping — track which element + mouse-start offset.
  const dragRef = useRef<{ id: ElementId; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setElements(initialState())
    setError(null)
  }, [open, initialState])

  const handleMouseDown = (id: ElementId) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    dragRef.current = {
      id,
      offsetX: e.clientX - rect.left - rect.width / 2,
      offsetY: e.clientY - rect.top - rect.height / 2,
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current
    const container = containerRef.current
    if (!drag || !container || !pageWidthPt) return
    const rect = container.getBoundingClientRect()
    const pxX = e.clientX - rect.left - drag.offsetX
    const pxY = e.clientY - rect.top - drag.offsetY
    // Clamp inside the PDF
    const clampedX = Math.max(0, Math.min(rect.width, pxX))
    const clampedY = Math.max(0, Math.min(rect.height, pxY))
    setElements(prev => ({
      ...prev,
      [drag.id]: {
        centerX: clampedX / scale,
        centerY: clampedY / scale,
      },
    }))
  }, [pageWidthPt, scale])

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  const handleApply = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/signing/restamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summitEntityId,
          documentType,
          coordOverrides: {
            officeStamp: { centerX: elements.officeStamp.centerX, centerY: elements.officeStamp.centerY },
            officeDate: { centerX: elements.officeDate.centerX, centerY: elements.officeDate.centerY },
            officeFirmName: { centerX: elements.officeFirmName.centerX, centerY: elements.officeFirmName.centerY },
            clientDate: { centerX: elements.clientDate.centerX, centerY: elements.clientDate.centerY },
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

  const handleReset = () => setElements(initialState())

  if (!open) return null

  /** Render a draggable overlay element. Returns null if PDF isn't loaded yet. */
  const renderElement = (id: ElementId, opts: {
    contentBg?: string
    content: React.ReactNode
    pxWidth: number
    pxHeight: number
    label: string
  }) => {
    if (!pageWidthPt) return null
    const el = elements[id]
    const leftPx = el.centerX * scale - opts.pxWidth / 2
    const topPx = el.centerY * scale - opts.pxHeight / 2
    return (
      <div
        key={id}
        onMouseDown={handleMouseDown(id)}
        title={`${opts.label} — גרור למקום הרצוי`}
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          width: opts.pxWidth,
          height: opts.pxHeight,
          cursor: dragRef.current?.id === id ? 'grabbing' : 'grab',
          background: opts.contentBg || 'rgba(197, 165, 114, 0.18)',
          border: '1.5px solid rgba(197, 165, 114, 0.85)',
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          userSelect: 'none',
          color: '#1B2A4A',
          fontWeight: 500,
          boxShadow: dragRef.current?.id === id ? '0 0 0 3px rgba(197, 165, 114, 0.35)' : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >
        {opts.content}
      </div>
    )
  }

  // Element sizes for the overlays — approximated in PDF points then scaled.
  const stampPxW = defaults.officeStamp.widthPt * scale
  const stampPxH = defaults.officeStamp.widthPt * 0.5 * scale
  const dateApprox = `${previewDateStr}`
  const dateFsPx = defaults.officeDate.fontSize * scale
  const datePxW = dateApprox.length * dateFsPx * 0.55
  const datePxH = dateFsPx * 1.4
  const firmFsPx = defaults.officeFirmName.fontSize * scale
  const firmPxW = defaults.officeFirmName.text.length * firmFsPx * 0.5
  const firmPxH = firmFsPx * 1.4
  const clientDateFsPx = defaults.clientDate.fontSize * scale
  const clientDatePxW = dateApprox.length * clientDateFsPx * 0.55
  const clientDatePxH = clientDateFsPx * 1.4

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 8,
          maxWidth: PIXEL_WIDTH + 64,
          width: '100%',
          maxHeight: '95vh',
          margin: '24px auto',
          padding: 16,
          direction: 'rtl',
          fontFamily: 'inherit',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1B2A4A' }}>
            🎯 כיוון מיקום החותמת — {documentType}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6B7280' }}
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
            fontSize: 12,
            color: '#374151',
            lineHeight: 1.5,
          }}
        >
          גרור כל אלמנט (חותמת, תאריך משרד, שם משרד, תאריך לקוח) למיקום הרצוי על המסמך. הצפייה המקדימה משקפת את התוכן הסופי. בסיום — לחץ &quot;אשר ושים חותמת&quot;.
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

        <div
          ref={containerRef}
          style={{
            position: 'relative',
            display: 'inline-block',
            border: '1px solid #E5E7EB',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <Document
            file={proxiedPdfUrl}
            loading={
              <div
                style={{
                  width: PIXEL_WIDTH,
                  height: PIXEL_WIDTH * 1.41,
                  background: '#F3F4F6',
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
                setPageWidthPt(pageInfo.width)
                setPageHeightPt(pageInfo.height)
              }}
            />
          </Document>

          {/* Draggable overlays only render once PDF dimensions are known. */}
          {pageWidthPt && pageHeightPt && (
            <>
              {renderElement('officeStamp', {
                pxWidth: stampPxW,
                pxHeight: stampPxH,
                label: 'חותמת המשרד',
                contentBg: managerStampUrl ? 'transparent' : 'rgba(197, 165, 114, 0.18)',
                content: managerStampUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={managerStampUrl}
                    alt="חותמת"
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }}
                  />
                ) : (
                  <span>🖋 חותמת</span>
                ),
              })}
              {renderElement('officeDate', {
                pxWidth: datePxW,
                pxHeight: datePxH,
                label: 'תאריך משרד',
                content: <span style={{ fontSize: dateFsPx, color: '#000' }}>{previewDateStr}</span>,
              })}
              {renderElement('officeFirmName', {
                pxWidth: firmPxW,
                pxHeight: firmPxH,
                label: 'שם המשרד',
                content: <span style={{ fontSize: firmFsPx, color: '#000' }}>{defaults.officeFirmName.text}</span>,
              })}
              {renderElement('clientDate', {
                pxWidth: clientDatePxW,
                pxHeight: clientDatePxH,
                label: 'תאריך לקוח (גיבוי)',
                contentBg: 'rgba(59, 130, 246, 0.12)',
                content: <span style={{ fontSize: clientDateFsPx, color: '#000' }}>{previewDateStr}</span>,
              })}
            </>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleApply}
            disabled={submitting || !pageWidthPt}
            style={{
              padding: '8px 16px',
              border: '1px solid #1B2A4A',
              background: '#1B2A4A',
              color: '#fff',
              borderRadius: 4,
              cursor: submitting ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {submitting ? '⏳ מכייל…' : '✓ אשר ושים חותמת'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={submitting}
            style={{
              padding: '8px 16px',
              border: '1px solid #D1D5DB',
              background: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            🔁 איפוס לברירת מחדל
          </button>
          <div style={{ fontSize: 11, color: '#6B7280', marginInlineStart: 'auto' }}>
            💡 גרור כל אלמנט למקום הרצוי. הצבעים: 🟡 משרד · 🔵 לקוח
          </div>
        </div>
      </div>
    </div>
  )
}
