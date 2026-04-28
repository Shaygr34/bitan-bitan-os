/**
 * 2Sign (Green Signature) API client.
 *
 * Base URL: https://app.2sign.co.il/api/
 * Docs: https://2signsdk.docs.apiary.io/
 *
 * Auth strategy (tries in order):
 * 1. API Key auth (TWOSIGN_CLIENT_ID + TWOSIGN_API_KEY) — no token management needed
 * 2. Email/password login (TWOSIGN_EMAIL + TWOSIGN_PASSWORD) → bearer token (cached 55min)
 *
 * Account: ron@bitancpa.co.il — Pro 100 plan
 * ClientId: dc096a0d-1c24-4991-a05a-53560aa37c06
 */

const BASE_URL = 'https://app.2sign.co.il/api'

// ---------------------------------------------------------------------------
// Auth — dual strategy: API Key (preferred) or email/password login
// ---------------------------------------------------------------------------

let cachedToken: string | null = null
let tokenExpiresAt = 0

function getApiKeyCredentials() {
  return {
    clientId: (process.env.TWOSIGN_CLIENT_ID || '').trim(),
    apiKey: (process.env.TWOSIGN_API_KEY || '').trim(),
  }
}

function getLoginCredentials() {
  return {
    email: (process.env.TWOSIGN_EMAIL || '').trim(),
    password: (process.env.TWOSIGN_PASSWORD || '').trim(),
  }
}

/**
 * Get auth headers. Tries API Key first, falls back to email/password login.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  // OAuth2 password grant — form-urlencoded (confirmed working)
  // Email: ron@bitancpa.com, token valid 24h
  const loginCreds = getLoginCredentials()
  if (!loginCreds.email || !loginCreds.password) {
    throw new Error('2Sign credentials not configured. Set TWOSIGN_EMAIL + TWOSIGN_PASSWORD')
  }

  if (cachedToken && Date.now() < tokenExpiresAt) {
    return { Authorization: `Bearer ${cachedToken}` }
  }

  const res = await fetch(`${BASE_URL}/Account/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: loginCreds.email,
      password: loginCreds.password,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`2Sign login failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  const token = data.access_token
  if (!token) {
    throw new Error('2Sign login response missing access_token')
  }

  cachedToken = token
  // Token expires_in is 86399 seconds (~24h), cache for 23h to be safe
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000
  return { Authorization: `Bearer ${token}` }
}

/**
 * Authenticated fetch wrapper. Handles auth retry on 401.
 */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders()
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...((options.headers as Record<string, string>) || {}),
  }

  // 2Sign requires POST for all endpoints (GET returns 405)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    ...options,
    headers,
  })

  // On 401, clear cached token and retry once
  if (res.status === 401 && cachedToken) {
    cachedToken = null
    tokenExpiresAt = 0
    const freshHeaders = await getAuthHeaders()
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...freshHeaders,
        ...((options.headers as Record<string, string>) || {}),
      },
    })
  }

  return res
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

export interface TwoSignProfile {
  UserId: number
  Email: string
  FirstName: string
  LastName: string
  CompanyName?: string
}

export async function getUserProfile(): Promise<TwoSignProfile> {
  const res = await authFetch('/Account/UserProfile')
  if (!res.ok) throw new Error(`2Sign getUserProfile failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TwoSignTemplate {
  TemplateId: number
  TemplateName: string
  TemplateNumber?: string
  UserId?: number
}

/** List all templates for the logged-in user. */
export async function listTemplates(): Promise<TwoSignTemplate[]> {
  const res = await authFetch('/Templates/ByToken')
  if (!res.ok) throw new Error(`2Sign listTemplates failed: ${res.status}`)
  return res.json()
}

/** Get template by ID. */
export async function getTemplate(userId: number, templateId: number): Promise<TwoSignTemplate> {
  const res = await authFetch(`/Templates/ById/${userId}/${templateId}`)
  if (!res.ok) throw new Error(`2Sign getTemplate failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface TwoSignClient {
  ClientId: number
  FirstName: string
  LastName: string
  Email?: string
  Phone?: string
  IdNumber?: string
}

/** Create a client (signer) in 2Sign. */
export async function createClient(client: {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  idNumber?: string
}): Promise<TwoSignClient> {
  const res = await authFetch('/Clients/Create', {
    method: 'POST',
    body: JSON.stringify({
      FirstName: client.firstName,
      LastName: client.lastName,
      Email: client.email || '',
      Phone: client.phone || '',
      IdNumber: client.idNumber || '',
    }),
  })
  if (!res.ok) throw new Error(`2Sign createClient failed: ${res.status}`)
  return res.json()
}

/** Search for a client by params. */
export async function findClient(params: {
  email?: string
  phone?: string
  idNumber?: string
}): Promise<TwoSignClient | null> {
  const res = await authFetch('/Clients/Information', {
    method: 'POST',
    body: JSON.stringify({
      Email: params.email || '',
      Phone: params.phone || '',
      IdNumber: params.idNumber || '',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data || null
}

// ---------------------------------------------------------------------------
// File Upload
// ---------------------------------------------------------------------------

/** Upload a PDF for signing. Returns a GUID to use when creating a task. */
export async function uploadFile(
  fileBuffer: Buffer,
  filename: string,
): Promise<string> {
  const authHeaders = await getAuthHeaders()

  // 2Sign file upload uses multipart form data
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' })
  formData.append('file', blob, filename)

  const res = await fetch(`${BASE_URL}/Tasks/UploadFileForTask`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      // Don't set Content-Type — FormData sets it with boundary
    },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`2Sign uploadFile failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  const guid = data.Guid || data.guid || data.GUID
  if (!guid) throw new Error('2Sign uploadFile response missing GUID')
  return guid
}

// ---------------------------------------------------------------------------
// Task Creation
// ---------------------------------------------------------------------------

/**
 * Signature position constants.
 * Format: "page-position|page-position"
 * Positions: 1=TopLeft 2=TopCenter 3=TopRight 4=MiddleLeft 5=MiddleCenter
 *            6=MiddleRight 7=BottomLeft 8=BottomCenter 9=BottomRight
 */
export type SignaturePosition = string

export interface CreateTaskOptions {
  /** Client ID (from createClient) */
  clientId: number
  /** File GUID (from uploadFile) — omit to use template */
  fileGuid?: string
  /** Template ID — omit to use uploaded file */
  templateId?: number
  /** Task title */
  title?: string
  /** Signature positions (e.g., "1-7|1-8" = page 1 bottom-left and bottom-center) */
  signaturePositions?: SignaturePosition
  /** Search word in PDF to auto-place signature */
  searchWordForSignature?: string
  /** Whether to send via SMS */
  sendSms?: boolean
  /** Whether to send via Email */
  sendEmail?: boolean
  /** Whether to send via WhatsApp */
  sendWhatsApp?: boolean
  /** Signature routine (for multi-signer) */
  isSignatureRoutine?: boolean
  /** Signer number in routine (1-based) */
  signatureRoutineSignerNumber?: number
}

export interface TwoSignTask {
  Guid: string
  TaskId: number
  Status?: string
  StatusId?: number
  ClientId?: number
  CreatedDate?: string
}

/** Create a signing task with an uploaded file. */
export async function createTaskWithFile(options: CreateTaskOptions): Promise<TwoSignTask> {
  if (!options.fileGuid) throw new Error('fileGuid is required for createTaskWithFile')

  const body: Record<string, unknown> = {
    ClientId: options.clientId,
    PdfFileGuid: options.fileGuid,
    TaskTitle: options.title || '',
    SendSms: options.sendSms ?? false,
    SendEmail: options.sendEmail ?? true,
    SendWhatsApp: options.sendWhatsApp ?? false,
  }

  if (options.signaturePositions) {
    body.SignaturesConstValues = options.signaturePositions
  }
  if (options.searchWordForSignature) {
    body.SearchWordForMarkingSignature = options.searchWordForSignature
  }
  if (options.isSignatureRoutine) {
    body.IsSignatureRoutine = true
    body.SignatureRoutineSignerNumber = options.signatureRoutineSignerNumber ?? 1
  }

  const res = await authFetch('/Tasks/WithFile', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`2Sign createTaskWithFile failed: ${res.status} ${text}`)
  }

  return res.json()
}

/** Create a signing task from a template (no file upload needed). */
export async function createTaskFromTemplate(options: CreateTaskOptions): Promise<TwoSignTask> {
  if (!options.templateId) throw new Error('templateId is required for createTaskFromTemplate')

  const body: Record<string, unknown> = {
    ClientId: options.clientId,
    TemplateId: options.templateId,
    TaskTitle: options.title || '',
    SendSms: options.sendSms ?? false,
    SendEmail: options.sendEmail ?? true,
    SendWhatsApp: options.sendWhatsApp ?? false,
  }

  if (options.isSignatureRoutine) {
    body.IsSignatureRoutine = true
    body.SignatureRoutineSignerNumber = options.signatureRoutineSignerNumber ?? 1
  }

  const res = await authFetch('/Tasks/WithoutFile', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`2Sign createTaskFromTemplate failed: ${res.status} ${text}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Task Status & Retrieval
// ---------------------------------------------------------------------------

export interface TwoSignTaskDetail {
  Guid: string
  TaskId: number
  Status: string
  StatusId: number
  ClientId: number
  CreatedDate: string
  CompletedDate?: string
  TaskTitle?: string
  Clients?: Array<{
    ClientId: number
    FirstName: string
    LastName: string
    Email?: string
    Phone?: string
    Status: string
    SignedDate?: string
  }>
}

/** Get task details by GUID. */
export async function getTask(guid: string): Promise<TwoSignTaskDetail> {
  const res = await authFetch(`/Task/ByGUID/${guid}`)
  if (!res.ok) throw new Error(`2Sign getTask failed: ${res.status}`)
  return res.json()
}

/** Search tasks by parameters. */
export async function searchTasks(params: {
  clientId?: number
  status?: string
  fromDate?: string
  toDate?: string
}): Promise<TwoSignTaskDetail[]> {
  const res = await authFetch('/Tasks/SearchByParams', {
    method: 'POST',
    body: JSON.stringify({
      ClientId: params.clientId ?? 0,
      Status: params.status || '',
      FromDate: params.fromDate || '',
      ToDate: params.toDate || '',
    }),
  })
  if (!res.ok) throw new Error(`2Sign searchTasks failed: ${res.status}`)
  return res.json()
}

/** Resend a task notification. */
export async function resendTask(
  taskGuid: string,
  options: { phone?: boolean; email?: boolean; whatsapp?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams({
    taskGuid,
    resendPhone: String(options.phone ?? false),
    resendEmail: String(options.email ?? true),
    resendWhatsapp: String(options.whatsapp ?? false),
  })
  const res = await authFetch(`/Task/ResendTask?${params}`)
  if (!res.ok) throw new Error(`2Sign resendTask failed: ${res.status}`)
}

// ---------------------------------------------------------------------------
// Signed Document Retrieval
// ---------------------------------------------------------------------------

export interface TwoSignAttachment {
  FileUrl?: string
  FileBytes?: string // base64
  FileName?: string
  FileType?: string
}

/**
 * Get the signed document for a completed task.
 * @param guid Task GUID
 * @param format 0=None (URL only), 1=Bytes, 2=Base64
 */
export async function getSignedDocument(
  guid: string,
  format: 0 | 1 | 2 = 2,
): Promise<TwoSignAttachment> {
  const res = await authFetch(`/TaskAttachments/GetSignedTaskDocument/${guid}?fileDownloadType=${format}`)
  if (!res.ok) throw new Error(`2Sign getSignedDocument failed: ${res.status}`)
  return res.json()
}

/** Get the original (unsigned) document for a task. */
export async function getOriginalDocument(
  guid: string,
  format: 0 | 1 | 2 = 0,
): Promise<TwoSignAttachment> {
  const res = await authFetch(`/TaskAttachments/GetOriginalTaskDocument/${guid}?fileDownloadType=${format}`)
  if (!res.ok) throw new Error(`2Sign getOriginalDocument failed: ${res.status}`)
  return res.json()
}

/** Get all attachments for a task (signed doc, ID uploads, etc.). */
export async function getAllAttachments(
  guid: string,
  format: 0 | 1 | 2 = 0,
): Promise<TwoSignAttachment[]> {
  const res = await authFetch(`/TaskAttachments/GetAllAttachments/${guid}?fileDownloadType=${format}`)
  if (!res.ok) throw new Error(`2Sign getAllAttachments failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Task Lifecycle
// ---------------------------------------------------------------------------

/** Delete a task. */
export async function deleteTask(guid: string): Promise<void> {
  const res = await authFetch(`/Task/DeleteTaskByGuid/${guid}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`2Sign deleteTask failed: ${res.status}`)
}

/** Get task count for the current month. */
export async function getMonthlyTaskCount(): Promise<number> {
  const res = await authFetch('/Tasks/GetTasksCountForMonth')
  if (!res.ok) throw new Error(`2Sign getMonthlyTaskCount failed: ${res.status}`)
  const data = await res.json()
  return data.Count ?? data.count ?? 0
}

// ---------------------------------------------------------------------------
// Convenience: End-to-End Signing Flow
// ---------------------------------------------------------------------------

/**
 * High-level helper: create a signing task for a client.
 *
 * 1. Find or create the client in 2Sign
 * 2. Upload the PDF (or use template)
 * 3. Create the signing task
 * 4. Return the task GUID for status polling
 *
 * This is the primary integration point for onboarding stage 2.
 */
export async function initiateSigning(params: {
  clientName: string
  clientEmail: string
  clientPhone: string
  clientIdNumber?: string
  pdfBuffer?: Buffer
  pdfFilename?: string
  templateId?: number
  title: string
  signaturePositions?: SignaturePosition
  searchWordForSignature?: string
  sendVia?: { sms?: boolean; email?: boolean; whatsapp?: boolean }
}): Promise<{ taskGuid: string; clientId: number }> {
  // 1. Parse name
  const nameParts = params.clientName.trim().split(/\s+/)
  const firstName = nameParts[0] || params.clientName
  const lastName = nameParts.slice(1).join(' ') || '.'

  // 2. Find or create client
  let client = await findClient({
    email: params.clientEmail,
    phone: params.clientPhone,
    idNumber: params.clientIdNumber,
  })

  if (!client) {
    client = await createClient({
      firstName,
      lastName,
      email: params.clientEmail,
      phone: params.clientPhone,
      idNumber: params.clientIdNumber,
    })
  }

  // 3. Create task
  let task: TwoSignTask

  if (params.pdfBuffer && params.pdfFilename) {
    // Upload file and create task
    const fileGuid = await uploadFile(params.pdfBuffer, params.pdfFilename)
    task = await createTaskWithFile({
      clientId: client.ClientId,
      fileGuid,
      title: params.title,
      signaturePositions: params.signaturePositions,
      searchWordForSignature: params.searchWordForSignature,
      sendSms: params.sendVia?.sms,
      sendEmail: params.sendVia?.email ?? true,
      sendWhatsApp: params.sendVia?.whatsapp,
    })
  } else if (params.templateId) {
    // Create from template
    task = await createTaskFromTemplate({
      clientId: client.ClientId,
      templateId: params.templateId,
      title: params.title,
      sendSms: params.sendVia?.sms,
      sendEmail: params.sendVia?.email ?? true,
      sendWhatsApp: params.sendVia?.whatsapp,
    })
  } else {
    throw new Error('Either pdfBuffer+pdfFilename or templateId is required')
  }

  return {
    taskGuid: task.Guid,
    clientId: client.ClientId,
  }
}
