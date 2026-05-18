'use client'

/**
 * PlacementStudio — the universal manual placement mini-app (Layer 1, the
 * spine). Generalizes RestampModal: spec-driven (not 4 fixed elements),
 * MULTI-PAGE, any number of signature/date/text/stamp fields, add fields by
 * hand, accept-or-adjust the suggestion, and apply.
 *
 * Flow: open → POST /placement/suggest (suggester + learned merged) → render
 * the PDF + draggable overlays → office accepts as-is or drags/adds → POST
 * /placement/apply (bakes office fields, injects client markers, records the
 * placement so it trains next time).
 *
 * Hard-failure guarantee in the UI: unresolved fields are loudly flagged and
 * parked center-page for manual placement — the office is never blocked.
 *
 * Additive: a NEW component. RestampModal/Path-B stays as-is; wiring this
 * into SigningCard for every flow is a deliberate follow-on step.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { PlacedField, PlacementSpec, FieldKind } from '@/lib/onboarding/placement-model'

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
}

const PIXEL_WIDTH = 720

interface Props {
  open: boolean
  onClose: () => void
  /** Same-origin URL of the document to place fields on. */
  pdfUrl: string
  formType: string
  summitEntityId?: string
  documentType?: string
  onSuccess: (placedPdfUrl: string) => void
}

const KIND_ICON: Record<FieldKind, string> = {
  signature: '✍️',
  stamp: '🛅',
  date: '📅',
  text: '🅣',
}

export default function PlacementStudio({
  open,
  onClose,
  pdfUrl,
  formType,
  summitEntityId,
  documentType,
  onSuccess,
}: Props) {
  const [spec, setSpec] = useState<PlacementSpec | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageWidthPt, setPageWidthPt] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null)

  const scale = pageWidthPt ? PIXEL_WIDTH / pageWidthPt : 1

  // react-pdf fetches the PDF from the BROWSER — a raw cross-origin Sanity/
  // 2Sign URL is CORS-blocked ("Failed to load PDF file"). Same fix as
  // RestampModal (#138): load via a same-origin proxy. suggest/apply still
  // get the original pdfUrl (server-side fetch, no CORS).
  const proxiedPdfUrl = `/api/onboarding/placement/pdf?url=${encodeURIComponent(pdfUrl)}`

  const loadSuggestion = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/placement/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, formType, summitEntityId, documentType }),
      })
      const data = (await res.json()) as { spec?: PlacementSpec; error?: string }
      if (!res.ok || !data.spec) throw new Error(data.error || 'טעינת הצעת מיקום נכשלה')
      setSpec(data.spec)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [pdfUrl, formType, summitEntityId, documentType])

  useEffect(() => {
    if (open) {
      setSpec(null)
      setPageIndex(0)
      void loadSuggestion()
    }
  }, [open, loadSuggestion])

  const moveField = (id: string, cx: number, cy: number) =>
    setSpec((prev) =>
      prev
        ? {
            ...prev,
            fields: prev.fields.map((f) =>
              f.id === id
                ? { ...f, centerX: cx, centerYFromTop: cy, source: 'manual', unresolved: false }
                : f,
            ),
          }
        : prev,
    )

  const onMouseDown = (id: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    dragRef.current = { id, offX: e.clientX - r.left - r.width / 2, offY: e.clientY - r.top - r.height / 2 }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current
      const c = containerRef.current
      if (!d || !c || !pageWidthPt) return
      const rect = c.getBoundingClientRect()
      const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left - d.offX))
      const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top - d.offY))
      moveField(d.id, px / scale, py / scale)
    },
    [pageWidthPt, scale],
  )
  const onMouseUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
  }, [onMouseMove])

  const addField = (kind: 'text' | 'date') => {
    if (!spec || !pageWidthPt) return
    const id = `manual-${kind}-${Date.now()}`
    const field: PlacedField = {
      id,
      kind,
      signer: 'office',
      pageIndex,
      centerX: pageWidthPt / 2,
      centerYFromTop: 300,
      fontSize: 11,
      value: kind === 'date' ? '' : 'טקסט',
      source: 'manual',
      label: kind === 'date' ? 'תאריך (ידני)' : 'טקסט (ידני)',
    }
    setSpec({ ...spec, fields: [...spec.fields, field] })
  }

  const editValue = (id: string, value: string) =>
    setSpec((p) => (p ? { ...p, fields: p.fields.map((f) => (f.id === id ? { ...f, value } : f)) } : p))

  const apply = async () => {
    if (!spec) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/placement/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, formType, spec, summitEntityId, documentType }),
      })
      const data = (await res.json()) as { ok?: boolean; placedPdfUrl?: string; error?: string }
      if (!res.ok || !data.placedPdfUrl) throw new Error(data.error || 'שמירת המיקום נכשלה')
      onSuccess(data.placedPdfUrl)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const pageFields = spec?.fields.filter((f) => f.pageIndex === pageIndex) ?? []
  const unresolvedCount = spec?.fields.filter((f) => f.unresolved).length ?? 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 8, maxWidth: PIXEL_WIDTH + 64, width: '100%',
          maxHeight: '95vh', margin: '24px auto', padding: 16, direction: 'rtl', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#102040' }}>🎯 מיקום חתימות — {formType}</h3>
          <button type="button" onClick={onClose} aria-label="סגור"
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6B7280' }}>×</button>
        </div>

        <div style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 4, padding: 8, marginBottom: 10, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
          ההצעה נטענה מהמערכת הלומדת. גרור כל שדה למקום הסופי, הוסף שדות לפי הצורך, ואשר. כל מיקום ידני מלמד את המערכת לפעם הבאה.
          {unresolvedCount > 0 && (
            <div style={{ color: '#991B1B', fontWeight: 600, marginTop: 4 }}>
              ⚠ {unresolvedCount} שדות לא אותרו אוטומטית — מקם אותם ידנית (מסומנים באדום).
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: 8, borderRadius: 4, marginBottom: 10, fontSize: 13 }}>{error}</div>
        )}

        {numPages > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
            <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((p) => p - 1)}>‹ הקודם</button>
            <span>עמוד {pageIndex + 1} / {numPages}</span>
            <button type="button" disabled={pageIndex >= numPages - 1} onClick={() => setPageIndex((p) => p + 1)}>הבא ›</button>
          </div>
        )}

        <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 40, color: '#6B7280' }}>⏳ טוען הצעת מיקום…</div>}
          {!loading && (
            <Document
              file={proxiedPdfUrl}
              onLoadSuccess={(d) => setNumPages(d.numPages)}
              onLoadError={(e) => setError(`טעינת PDF נכשלה: ${e.message}`)}
              loading={<div style={{ width: PIXEL_WIDTH, height: PIXEL_WIDTH * 1.41, background: '#F3F4F6' }} />}
            >
              <Page
                pageNumber={pageIndex + 1}
                width={PIXEL_WIDTH}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onLoadSuccess={(pi) => setPageWidthPt(pi.width)}
              />
            </Document>
          )}

          {pageWidthPt &&
            pageFields.map((f) => {
              const w = (f.kind === 'stamp' ? f.widthPt ?? 95 : 80) * scale
              const h = (f.kind === 'stamp' ? (f.widthPt ?? 95) * 0.5 : (f.fontSize ?? 14) * 1.6) * scale
              const left = f.centerX * scale - w / 2
              const top = f.centerYFromTop * scale - h / 2
              const isClient = f.signer === 'client'
              const border = f.unresolved ? '#C0392B' : isClient ? '#2563EB' : '#C5A572'
              const bg = f.unresolved ? 'rgba(192,57,43,0.12)' : isClient ? 'rgba(37,99,235,0.12)' : 'rgba(197,165,114,0.18)'
              return (
                <div
                  key={f.id}
                  onMouseDown={onMouseDown(f.id)}
                  title={`${f.label || f.id} — גרור למקם`}
                  style={{
                    position: 'absolute', left, top, width: w, height: h,
                    cursor: dragRef.current?.id === f.id ? 'grabbing' : 'grab',
                    background: bg, border: `1.5px solid ${border}`, borderRadius: 3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#102040', fontWeight: 500, userSelect: 'none', textAlign: 'center',
                  }}
                >
                  {KIND_ICON[f.kind]} {f.label || f.id}
                </div>
              )
            })}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={apply} disabled={submitting || !spec || loading}
            style={{ padding: '8px 16px', border: '1px solid #102040', background: '#102040', color: '#fff', borderRadius: 4, cursor: submitting ? 'wait' : 'pointer', fontWeight: 600 }}>
            {submitting ? '⏳ מחיל…' : '✓ אשר ושמור מיקום'}
          </button>
          <button type="button" onClick={() => void loadSuggestion()} disabled={loading || submitting}
            style={{ padding: '8px 16px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 4, cursor: 'pointer' }}>
            🔁 איפוס להצעה
          </button>
          <button type="button" onClick={() => addField('text')} disabled={!spec}
            style={{ padding: '8px 12px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 4, cursor: 'pointer' }}>+ טקסט</button>
          <button type="button" onClick={() => addField('date')} disabled={!spec}
            style={{ padding: '8px 12px', border: '1px solid #D1D5DB', background: '#fff', borderRadius: 4, cursor: 'pointer' }}>+ תאריך</button>
          <div style={{ fontSize: 11, color: '#6B7280', marginInlineStart: 'auto' }}>🟡 משרד · 🔵 לקוח · 🔴 לא אותר</div>
        </div>

        {/* Inline value editors for text/date fields on this page. */}
        {pageFields.filter((f) => f.kind === 'text' || f.kind === 'date').map((f) => (
          <div key={`v-${f.id}`} style={{ marginTop: 6, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#6B7280' }}>{f.label || f.id}:</span>
            <input value={f.value || ''} onChange={(e) => editValue(f.id, e.target.value)}
              placeholder={f.kind === 'date' ? 'dd/mm/yyyy' : 'טקסט'}
              style={{ border: '1px solid #D1D5DB', borderRadius: 4, padding: '3px 6px', fontSize: 12 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
