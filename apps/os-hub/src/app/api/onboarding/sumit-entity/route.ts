/**
 * PATCH /api/onboarding/sumit-entity
 *
 * Updates one or more fields on a Sumit customer entity (folder 557688522).
 * Used by the editable ClientInfoCard in the OS to push office-side edits
 * back to Sumit. Whitelisted field set — arbitrary writes are rejected.
 *
 * Body:
 *   {
 *     entityId: string | number,
 *     fields: {
 *       Customers_FullName?: string,
 *       Customers_CompanyNumber?: string,
 *       Customers_Phone?: string,
 *       Customers_EmailAddress?: string,
 *       Customers_Address?: string,
 *       Customers_City?: string,
 *       Customers_ZipCode?: string,
 *       Customers_Birthdate?: string,        // ISO date
 *       Customers_Text?: string,             // הערה מרכזית
 *       'סוג לקוח'?: number,                  // entity ref ID
 *       'תחום עיסוק'?: number,                // entity ref ID
 *       'מנהל תיק'?: number,                  // entity ref ID
 *       'מנהל/ת חשבונות'?: number,           // entity ref ID
 *       'עובד/ת ביקורת'?: number,            // entity ref ID
 *     }
 *   }
 *
 * Response: 200 { ok: true } | 4xx { error }
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUMMIT_BASE = 'https://api.sumit.co.il'
const CLIENT_FOLDER = '557688522'

/**
 * Whitelist of editable fields. Anything not in this set is rejected.
 * - Scalar fields (string/number/date) pass through as-is.
 * - Entity-ref fields expect a numeric entity ID.
 */
const SCALAR_FIELDS = new Set([
  'Customers_FullName',
  'Customers_CompanyNumber',
  'Customers_Phone',
  'Customers_EmailAddress',
  'Customers_Address',
  'Customers_City',
  'Customers_ZipCode',
  'Customers_Birthdate',
  'Customers_Text',
])

const ENTITY_REF_FIELDS = new Set([
  'סוג לקוח',
  'תחום עיסוק',
  'מנהל תיק',
  'מנהל/ת חשבונות',
  'עובד/ת ביקורת',
])

interface PatchRequestBody {
  entityId: string | number
  fields: Record<string, unknown>
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<PatchRequestBody>
    const { entityId, fields } = body

    if (!entityId || !fields || typeof fields !== 'object') {
      return NextResponse.json(
        { error: 'entityId and fields are required' },
        { status: 400 },
      )
    }

    const numericId = typeof entityId === 'string' ? parseInt(entityId, 10) : entityId
    if (!numericId || Number.isNaN(numericId)) {
      return NextResponse.json({ error: 'invalid entityId' }, { status: 400 })
    }

    // Filter + validate fields.
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (SCALAR_FIELDS.has(key)) {
        if (value === null || value === '') {
          properties[key] = ''
        } else if (typeof value === 'string' || typeof value === 'number') {
          properties[key] = value
        } else {
          return NextResponse.json(
            { error: `Invalid value type for scalar field "${key}"` },
            { status: 400 },
          )
        }
      } else if (ENTITY_REF_FIELDS.has(key)) {
        if (value === null) {
          properties[key] = null
        } else if (typeof value === 'number') {
          properties[key] = value
        } else if (typeof value === 'string' && /^\d+$/.test(value)) {
          properties[key] = parseInt(value, 10)
        } else {
          return NextResponse.json(
            { error: `Entity-ref field "${key}" expects a numeric ID` },
            { status: 400 },
          )
        }
      } else {
        return NextResponse.json(
          { error: `Field "${key}" is not whitelisted for editing` },
          { status: 400 },
        )
      }
    }

    if (Object.keys(properties).length === 0) {
      return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 })
    }

    const creds = {
      CompanyID: parseInt(process.env.SUMMIT_COMPANY_ID || '0', 10),
      APIKey: (process.env.SUMMIT_API_KEY || '').trim(),
    }
    if (!creds.APIKey || !creds.CompanyID) {
      return NextResponse.json({ error: 'Summit credentials missing' }, { status: 500 })
    }

    const upstream = await fetch(`${SUMMIT_BASE}/crm/data/updateentity/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Language': 'he' },
      body: JSON.stringify({
        Credentials: creds,
        Entity: {
          ID: numericId,
          Folder: CLIENT_FOLDER,
          Properties: properties,
        },
      }),
    })

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return NextResponse.json(
        { error: `Summit update failed: HTTP ${upstream.status}`, detail: text.slice(0, 200) },
        { status: 502 },
      )
    }
    const json = (await upstream.json().catch(() => null)) as { Status?: number; UserErrorMessage?: string } | null
    if (json?.Status !== 0) {
      return NextResponse.json(
        { error: json?.UserErrorMessage || 'Summit update returned non-OK status' },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, fieldsUpdated: Object.keys(properties) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
