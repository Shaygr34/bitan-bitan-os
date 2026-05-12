/**
 * Stateless HMAC magic-link token for the office authorize-gate (Option C).
 *
 * Format:  base64url(payload).base64url(hmac)
 *   payload = JSON.stringify({ r: recordId, t: taskGuid, exp: epochSeconds })
 *   hmac    = HMAC-SHA-256(ONBOARDING_AUTHORIZE_SECRET, payload)
 *
 * Why HMAC and not jose/jsonwebtoken: zero new dependency, native crypto
 * module covers everything we need (sign + constant-time compare). Secret
 * rotation revokes every outstanding link instantly.
 *
 * Verification rejects on:
 *   - malformed token shape
 *   - HMAC mismatch (timingSafeEqual)
 *   - exp <= now
 *   - missing ONBOARDING_AUTHORIZE_SECRET (fail-closed)
 *
 * Default TTL: 7 days — long enough for a weekend, short enough that an
 * old forwarded email can't authorize forever.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { onboardingAuthorizeSecret } from '@/config/integrations'

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60

interface TokenPayload {
  r: string // onboardingRecord _id
  t: string // SigningTask taskGuid
  exp: number // epoch seconds
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64')
}

function hmac(payloadB64: string): Buffer {
  return createHmac('sha256', onboardingAuthorizeSecret).update(payloadB64).digest()
}

export function signAuthorizeToken(opts: {
  recordId: string
  taskGuid: string
  ttlSeconds?: number
}): string {
  if (!onboardingAuthorizeSecret) {
    throw new Error('ONBOARDING_AUTHORIZE_SECRET is not configured')
  }
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const payload: TokenPayload = {
    r: opts.recordId,
    t: opts.taskGuid,
    exp: Math.floor(Date.now() / 1000) + ttl,
  }
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  const hmacB64 = base64UrlEncode(hmac(payloadB64))
  return `${payloadB64}.${hmacB64}`
}

export function verifyAuthorizeToken(
  token: string,
): { recordId: string; taskGuid: string } | null {
  if (!onboardingAuthorizeSecret) return null
  if (typeof token !== 'string' || !token) return null

  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null

  const payloadB64 = token.slice(0, dot)
  const hmacB64 = token.slice(dot + 1)

  let providedHmac: Buffer
  try {
    providedHmac = base64UrlDecode(hmacB64)
  } catch {
    return null
  }

  const expectedHmac = hmac(payloadB64)
  if (providedHmac.length !== expectedHmac.length) return null
  if (!timingSafeEqual(providedHmac, expectedHmac)) return null

  let parsed: TokenPayload
  try {
    parsed = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as TokenPayload
  } catch {
    return null
  }

  if (!parsed || typeof parsed.r !== 'string' || typeof parsed.t !== 'string') return null
  if (typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) return null

  return { recordId: parsed.r, taskGuid: parsed.t }
}
