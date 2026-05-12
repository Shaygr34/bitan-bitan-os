/**
 * /onboarding/authorize?token=<HMAC>
 *
 * Single-shot landing page for the office authorize-gate magic link.
 * Server component reads the token from searchParams and hands it to a
 * client component that POSTs to /api/onboarding/signing/authorize on mount.
 *
 * No chrome — this is a transactional view; users land here from email,
 * confirm, and leave.
 */
import AuthorizeFlow from './AuthorizeFlow'

export const dynamic = 'force-dynamic'

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const params = await searchParams
  const raw = params?.token
  const token = Array.isArray(raw) ? raw[0] : raw

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#F7F6F3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Heebo, Arial, sans-serif',
      }}
    >
      <AuthorizeFlow token={token ?? ''} />
    </main>
  )
}
