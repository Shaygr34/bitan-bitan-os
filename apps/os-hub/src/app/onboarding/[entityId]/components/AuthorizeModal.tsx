'use client'

import AuthorizeFlow from '@/app/onboarding/authorize/AuthorizeFlow'

/**
 * Modal wrapper around AuthorizeFlow so the OS-side "אשר עכשיו" button
 * uses the SAME preview-then-confirm UX as the email-link page. Was:
 * fragmented one-click POST. Now: identical multi-step flow shared
 * across both surfaces (Shay feedback 2026-05-14).
 *
 * Mounted only when the office clicks "אשר עכשיו" — the parent mints an
 * authorize token first, then opens this modal with the token. The modal
 * passes onSuccess to AuthorizeFlow which suppresses the built-in success
 * card and bubbles up to us — we close the modal + tell the parent to
 * re-fetch the task list (which now shows ✓).
 */
interface Props {
  open: boolean
  token: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function AuthorizeModal({ open, token, onClose, onSuccess }: Props) {
  if (!open || !token) return null

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
          maxWidth: 900,
          width: '100%',
          margin: '32px auto',
          direction: 'rtl',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'sticky',
            top: 0,
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: 22,
            cursor: 'pointer',
            float: 'left',
            padding: 4,
            zIndex: 1,
          }}
          aria-label="סגור"
        >
          ×
        </button>
        <AuthorizeFlow
          token={token}
          onSuccess={() => {
            onSuccess()
            onClose()
          }}
        />
      </div>
    </div>
  )
}
