'use client'

import { useEffect, useState, useRef } from 'react'

type State =
  | { kind: 'loading' }
  | {
      kind: 'preview'
      clientName?: string
      summitEntityId?: string
      documentType?: string
      signedDocUrl?: string
    }
  | { kind: 'confirming' }
  | {
      kind: 'success'
      clientName?: string
      summitEntityId?: string
      stampedDocUrl?: string
      signedDocUrl?: string
      alreadyApplied?: boolean
    }
  | { kind: 'error'; message: string; summitEntityId?: string }

interface Props {
  token: string
}

const DOC_LABELS: Record<string, string> = {
  'poa-tax-authority': 'ייפוי כוח רשות המיסים',
  'poa-nii-withholdings': 'ב"ל ניכויים',
  'poa-nii-representatives': 'ב"ל מיוצגים',
}

export default function AuthorizeFlow({ token }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const previewFired = useRef(false)

  // Fetch preview metadata on mount (does NOT materialize)
  useEffect(() => {
    if (previewFired.current) return
    previewFired.current = true

    if (!token) {
      setState({ kind: 'error', message: 'חסר טוקן בכתובת' })
      return
    }

    const load = async () => {
      try {
        const res = await fetch(
          `/api/onboarding/signing/authorize/preview?token=${encodeURIComponent(token)}`,
          { method: 'GET' },
        )
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

        if (!res.ok) {
          const errVal = data.error
          const message =
            typeof errVal === 'string'
              ? errVal
              : errVal && typeof errVal === 'object' && 'message' in errVal
              ? String((errVal as { message: unknown }).message)
              : 'טעינת הפרטים נכשלה'
          setState({
            kind: 'error',
            message,
            summitEntityId:
              typeof data.summitEntityId === 'string' ? data.summitEntityId : undefined,
          })
          return
        }

        if (data.alreadyApplied === true) {
          setState({
            kind: 'success',
            alreadyApplied: true,
            clientName: str(data.clientName),
            summitEntityId: str(data.summitEntityId),
            stampedDocUrl: str(data.stampedDocUrl),
            signedDocUrl: str(data.signedDocUrl),
          })
          return
        }

        setState({
          kind: 'preview',
          clientName: str(data.clientName),
          summitEntityId: str(data.summitEntityId),
          documentType: str(data.documentType),
          signedDocUrl: str(data.signedDocUrl),
        })
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'שגיאת רשת',
        })
      }
    }

    void load()
  }, [token])

  const handleConfirm = async () => {
    setState({ kind: 'confirming' })
    try {
      const res = await fetch('/api/onboarding/signing/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (res.ok) {
        setState({
          kind: 'success',
          clientName: str(data.clientName),
          summitEntityId: str(data.summitEntityId),
          stampedDocUrl: str(data.stampedDocUrl),
          signedDocUrl: str(data.signedDocUrl),
          alreadyApplied: data.alreadyApplied === true,
        })
      } else {
        const errVal = data.error
        const message =
          typeof errVal === 'string'
            ? errVal
            : errVal && typeof errVal === 'object' && 'message' in errVal
            ? String((errVal as { message: unknown }).message)
            : 'אישור נכשל'
        setState({
          kind: 'error',
          message,
          summitEntityId: str(data.summitEntityId),
        })
      }
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'שגיאת רשת',
      })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (state.kind === 'loading') {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 16, color: '#1B2A4A' }}>
          {'\u22EF'} טוען פרטים...
        </p>
      </div>
    )
  }

  if (state.kind === 'preview') {
    const docLabel = state.documentType
      ? DOC_LABELS[state.documentType] || state.documentType
      : 'מסמך'
    return (
      <div style={{ ...cardStyle, maxWidth: 880 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, color: '#1B2A4A', fontWeight: 700 }}>
          נדרש אישור משרד
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: '#4A5568', lineHeight: 1.6 }}>
          {state.clientName ? <strong>{state.clientName}</strong> : 'הלקוח'} חתם על{' '}
          <strong>{docLabel}</strong>. נא לסקור את המסמך החתום ולאשר את חתימת המשרד.
        </p>

        {state.signedDocUrl ? (
          <div
            style={{
              border: '1px solid #E2E0DB',
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 18,
              background: '#F8F7F4',
            }}
          >
            <iframe
              src={state.signedDocUrl}
              title="מסמך חתום על ידי הלקוח"
              style={{ width: '100%', height: 560, border: 'none', display: 'block' }}
            />
          </div>
        ) : (
          <p style={{ color: '#92400E', fontSize: 13, margin: '0 0 18px' }}>
            (לא ניתן להציג תצוגה מקדימה — אפשר להמשיך לאשר, או לפנות ל-IT)
          </p>
        )}

        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 18,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            <strong>לחיצה על &quot;אשר וחתום&quot;</strong> תחיל את חתימת המשרד +
            תאריך על המסמך, תשלח אותו לסאמיט כהערה, ותעביר את הלקוח לשלב 4 (רשויות).
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              background: '#C5A572',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            ✓ אשר וחתום בשם המשרד
          </button>
          {state.signedDocUrl && (
            <a
              href={state.signedDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#1B2A4A',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              פתח PDF בחלון חדש
            </a>
          )}
          {state.summitEntityId && (
            <a
              href={`/onboarding/${encodeURIComponent(state.summitEntityId)}`}
              style={{
                background: 'transparent',
                color: '#4A5568',
                padding: '12px 20px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: 14,
                border: '1px solid #E2E0DB',
              }}
            >
              ביטול — חזור לתיק
            </a>
          )}
        </div>
      </div>
    )
  }

  if (state.kind === 'confirming') {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 16, color: '#1B2A4A' }}>
          {'\u22EF'} מחיל חתימת משרד...
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#718096', lineHeight: 1.5 }}>
          חותם, מעלה ל-Sanity, מוסיף הערה לסאמיט, ומעדכן את שלב הלקוח. ייקח כ-30 שניות.
        </p>
      </div>
    )
  }

  if (state.kind === 'success') {
    const link = state.stampedDocUrl || state.signedDocUrl
    const detail = state.summitEntityId
      ? `/onboarding/${encodeURIComponent(state.summitEntityId)}`
      : null

    return (
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.12)',
              color: '#16A34A',
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            {'\u2713'}
          </span>
          <h1 style={{ margin: 0, fontSize: 18, color: '#1B2A4A', fontWeight: 700 }}>
            {state.alreadyApplied ? 'אושר כבר' : 'אושר בהצלחה'}
          </h1>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: '#4A5568', lineHeight: 1.6 }}>
          {state.clientName ? `${state.clientName} ` : ''}
          חתם — חתימת המשרד הוטמעה. הלקוח עבר לשלב 4 (רשויות).
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                background: '#C5A572',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              צפה ב-PDF החתום
            </a>
          )}
          {detail && (
            <a
              href={detail}
              style={{
                display: 'inline-block',
                background: '#1B2A4A',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              לתיק הלקוח
            </a>
          )}
        </div>
      </div>
    )
  }

  // error
  const detail = state.summitEntityId
    ? `/onboarding/${encodeURIComponent(state.summitEntityId)}`
    : null
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)',
            color: '#DC2626',
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {'!'}
        </span>
        <h1 style={{ margin: 0, fontSize: 18, color: '#1B2A4A', fontWeight: 700 }}>
          האישור נכשל
        </h1>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 14, color: '#4A5568', lineHeight: 1.6 }}>
        {state.message}
      </p>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#718096', lineHeight: 1.5 }}>
        ניתן לנסות שוב מתוך מסך הלקוח, או לפנות ל-IT.
      </p>
      {detail && (
        <a
          href={detail}
          style={{
            display: 'inline-block',
            background: '#1B2A4A',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          לתיק הלקוח
        </a>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E0DB',
  borderRadius: 12,
  maxWidth: 480,
  width: '100%',
  padding: 32,
  boxShadow: '0 4px 20px rgba(27,42,74,0.08)',
  textAlign: 'right',
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
