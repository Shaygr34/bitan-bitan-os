#!/usr/bin/env node
/**
 * Verify-first script for the GetSignedTaskLocationBlob endpoint fix.
 *
 * Runs the corrected 2Sign signed-PDF retrieval call against a known
 * test GUID and reports whether we get back a real SAS URL + downloadable
 * PDF. Run this BEFORE shipping the production code change so we never
 * merge another silent-fail loop.
 *
 * Usage:
 *   TWOSIGN_EMAIL=digital@bitan-finance.co.il TWOSIGN_PASSWORD=... \
 *     node apps/os-hub/scripts/verify-getsigned.mjs [guid]
 *
 * Default GUID: 6692c8f7-973d-47a8-9ffd-e150f58d6568 (shay test record, signed)
 *
 * Tries POST first (production house rule per twosign-client.ts authFetch),
 * falls back to GET (which is what the Apiary blueprint §2709 specifies).
 * Reports which method worked so we know what the production change needs.
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const BASE = 'https://app.2sign.co.il/api'
const DEFAULT_GUID = '6692c8f7-973d-47a8-9ffd-e150f58d6568'
const guid = process.argv[2] || DEFAULT_GUID

const email = process.env.TWOSIGN_EMAIL?.trim()
const password = process.env.TWOSIGN_PASSWORD?.trim()
if (!email || !password) {
  console.error('FATAL: set TWOSIGN_EMAIL and TWOSIGN_PASSWORD env vars')
  process.exit(2)
}

function fmt(obj) {
  return JSON.stringify(obj, null, 2)
}

async function login() {
  const res = await fetch(`${BASE}/Account/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: email,
      password,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Login failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('Login response missing access_token')
  return data.access_token
}

async function callEndpoint(token, method) {
  const url = `${BASE}/Tasks/GetSignedTaskLocationBlob?guid=${encodeURIComponent(guid)}&fileDownloadType=0`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // POST with empty body is what the production authFetch does
    ...(method === 'POST' ? { body: '' } : {}),
  })
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, raw: text, parsed }
}

async function main() {
  console.log(`[verify] GUID: ${guid}`)
  console.log(`[verify] Logging in as ${email}…`)
  const token = await login()
  console.log(`[verify] ✓ Token acquired (${token.slice(0, 24)}…)\n`)

  let result = null
  let methodUsed = null

  console.log('[verify] Attempt 1: POST /Tasks/GetSignedTaskLocationBlob (production house rule)')
  const postResult = await callEndpoint(token, 'POST')
  console.log(`[verify]   → HTTP ${postResult.status}`)

  if (postResult.ok) {
    result = postResult
    methodUsed = 'POST'
  } else {
    console.log(`[verify]   raw: ${postResult.raw.slice(0, 240)}`)
    console.log('\n[verify] Attempt 2: GET (Apiary blueprint §2709 says GET)')
    const getResult = await callEndpoint(token, 'GET')
    console.log(`[verify]   → HTTP ${getResult.status}`)
    if (getResult.ok) {
      result = getResult
      methodUsed = 'GET'
    } else {
      console.log(`[verify]   raw: ${getResult.raw.slice(0, 600)}`)
      throw new Error('Both POST and GET failed — endpoint name or auth may still be wrong')
    }
  }

  console.log(`\n[verify] ✓ Endpoint accepted ${methodUsed}\n`)
  console.log('[verify] Response shape:')
  if (result.parsed) {
    const summary = {
      Status: result.parsed.Status,
      Message_preview: typeof result.parsed.Message === 'string' ? result.parsed.Message.slice(0, 140) + '…' : result.parsed.Message,
      'ResponseObject.SignedTaskLinkBlob_preview':
        typeof result.parsed.ResponseObject?.SignedTaskLinkBlob === 'string'
          ? result.parsed.ResponseObject.SignedTaskLinkBlob.slice(0, 140) + '…'
          : result.parsed.ResponseObject?.SignedTaskLinkBlob,
      'ResponseObject.IsSigned': result.parsed.ResponseObject?.IsSigned,
      'ResponseObject.SignedOn': result.parsed.ResponseObject?.SignedOn,
      'ResponseObject.TaskGuid': result.parsed.ResponseObject?.TaskGuid,
    }
    console.log(fmt(summary))
  } else {
    console.log(result.raw.slice(0, 800))
    throw new Error('Response was not JSON')
  }

  const sasUrl = result.parsed.Message || result.parsed.ResponseObject?.SignedTaskLinkBlob
  if (!sasUrl || !sasUrl.startsWith('http')) {
    throw new Error('No SAS URL found in either Message or ResponseObject.SignedTaskLinkBlob')
  }

  console.log(`\n[verify] SAS URL extracted (${sasUrl.length} chars). Downloading PDF…`)
  const pdfRes = await fetch(sasUrl)
  console.log(`[verify]   → HTTP ${pdfRes.status} ${pdfRes.headers.get('content-type') || '?'}`)
  if (!pdfRes.ok) {
    throw new Error(`PDF download failed: ${pdfRes.status}`)
  }
  const buf = Buffer.from(await pdfRes.arrayBuffer())
  const sha = createHash('sha256').update(buf).digest('hex')
  const outPath = `/tmp/2sign-verify-${guid}.pdf`
  writeFileSync(outPath, buf)

  console.log(`\n[verify] ✓ PDF downloaded`)
  console.log(`[verify]   size:   ${buf.length.toLocaleString()} bytes`)
  console.log(`[verify]   sha256: ${sha}`)
  console.log(`[verify]   path:   ${outPath}`)
  console.log(`\n[verify] DECISION: production code should use METHOD=${methodUsed} and read SAS URL from \`body.Message\` (top-level)`)
}

main().catch((err) => {
  console.error('\n[verify] ✗ FAILED:', err.message)
  process.exit(1)
})
