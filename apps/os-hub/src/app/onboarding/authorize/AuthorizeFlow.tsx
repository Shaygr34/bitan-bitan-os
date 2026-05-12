'use client'

import { useEffect, useState, useRef } from 'react'

type State =
  | { kind: 'loading' }
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

export default function AuthorizeFlow({ token }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    if (!token) {
      setState({ kind: 'error', message: 'חסר טוקן בכתובת' })
      return
    }

    const go = async () => {
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
            clientName: typeof data.clientName === 'string' ? data.clientName : undefined,
            summitEntityId:
              typeof data.summitEntityId === 'string' ? data.summitEntityId : undefined,
            stampedDocUrl:
              typeof data.stampedDocUrl === 'string' ? data.stampedDocUrl : undefined,
            signedDocUrl:
              typeof data.signedDocUrl === 'string' ? data.signedDocUrl : undefined,
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
            summitEntityId:
              typeof data.summitEntityId === 'string' ? data.summitEntityId : undefined,
          })
        }
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'שגיאת רשת',
        })
      }
    }

    void go()
  }, [token])

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

  if (state.kind === 'loading') {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 16, color: '#1B2A4A' }}>{'\u22EF'} מאמת...</p>
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
          חתם — חתימת המשרד הוטמעה. הלקוח עבר לשלב 3.
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
