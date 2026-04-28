import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE_URL = 'https://app.2sign.co.il/api'

/**
 * GET /api/onboarding/signing/test — test 2Sign API connection.
 * Uses direct fetch to avoid client abstraction issues during debugging.
 * Remove this endpoint after confirming connection works.
 */
export async function GET() {
  const results: Record<string, unknown> = { ok: false }

  const email = (process.env.TWOSIGN_EMAIL || '').trim()
  const password = (process.env.TWOSIGN_PASSWORD || '').trim()

  if (!email || !password) {
    return NextResponse.json({ error: 'TWOSIGN_EMAIL or TWOSIGN_PASSWORD not set', ok: false })
  }

  // Step 1: Login
  try {
    const loginRes = await fetch(`${BASE_URL}/Account/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        username: email,
        password: password,
      }).toString(),
    })

    if (!loginRes.ok) {
      const text = await loginRes.text().catch(() => '')
      return NextResponse.json({ error: `Login failed: ${loginRes.status}`, detail: text, ok: false })
    }

    const loginData = await loginRes.json()
    const token = loginData.access_token
    if (!token) {
      return NextResponse.json({ error: 'No access_token in login response', loginData, ok: false })
    }

    results.login = 'success'
    results.email = loginData.userName
    results.tokenExpires = loginData['.expires']
  } catch (err) {
    return NextResponse.json({ error: `Login error: ${err}`, ok: false })
  }

  // Step 2: Task count (confirms API access works)
  try {
    const token = (results as Record<string, string>).token
    const loginRes = await fetch(`${BASE_URL}/Account/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: email, password }).toString(),
    })
    const { access_token } = await loginRes.json()

    const countRes = await fetch(`${BASE_URL}/Tasks/GetTasksCountForMonth`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const countData = await countRes.json()
    results.tasksApi = {
      status: countData.Status,
      tasksCount: countData.ResponseObject?.TasksCount,
      quotaLeft: countData.ResponseObject?.TasksQuotaLeft,
    }
  } catch (err) {
    results.tasksApiError = String(err)
  }

  results.ok = results.login === 'success' && (results.tasksApi as Record<string, unknown>)?.status === 'success'
  results.summary = results.ok
    ? '2Sign API connection verified — login + task API working'
    : '2Sign connection partial — check details'

  return NextResponse.json(results)
}
