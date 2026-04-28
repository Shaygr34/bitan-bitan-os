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
  name: string
  email?: string
  phone?: string
  idNumber?: string
}): Promise<TwoSignClient> {
  const res = await authFetch('/Clients/Create', {
    body: JSON.stringify({
      Name: client.name,
      Emails: client.email || '',
      Phones: client.phone || '',
    }),
  })
  if (!res.ok) throw new Error(`2Sign createClient failed: ${res.status}`)
  const data = await res.json()
  if (data.Status === 'failed') {
    throw new Error(`2Sign createClient failed: ${data.MessageDescription || data.Message || 'Unknown'}`)
  }
  const ro = data.ResponseObject || data
  return {
    ClientId: ro.Id || ro.ClientId || 0,
    FirstName: client.name.split(/\s+/)[0] || client.name,
    LastName: client.name.split(/\s+/).slice(1).join(' ') || '.',
    Email: client.email,
    Phone: client.phone,
  }
}

/** Search for a client by params. */
export async function findClient(params: {
  email?: string
  phone?: string
}): Promise<TwoSignClient | null> {
  const res = await authFetch('/Clients/Information', {
    body: JSON.stringify({
      Emails: params.email || '',
      Phones: params.phone || '',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (data.Status === 'failed') return null
  const ro = data.ResponseObject || data
  if (!ro || !ro.Id) return null
  return {
    ClientId: ro.Id,
    FirstName: ro.Name?.split(/\s+/)[0] || '',
    LastName: ro.Name?.split(/\s+/).slice(1).join(' ') || '',
    Email: params.email,
    Phone: params.phone,
  }
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
  const ro = data.ResponseObject || data
  const guid = ro.PdfGuid || ro.TaskGuid || ro.Guid || data.Guid
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
  /** Primary task GUID for linking signer 2+ in a routine */
  routinePrimaryTaskGuid?: string
}

export interface TwoSignTask {
  Guid: string
  TaskId: number
  Status?: string
  StatusId?: number
  ClientId?: number
  CreatedDate?: string
}

/**
 * Create a signing task with an uploaded file.
 * Endpoint: POST /api/Tasks/CreateTaskWithFileOption
 * Requires PdfGuid from prior uploadFile() call.
 */
export async function createTaskWithFile(options: CreateTaskOptions & {
  clientEmail?: string
  clientPhone?: string
}): Promise<TwoSignTask> {
  if (!options.fileGuid) throw new Error('fileGuid is required for createTaskWithFile')

  const body: Record<string, unknown> = {
    ClientId: options.clientId,
    PdfGuid: options.fileGuid,
    TaskSubject: options.title || '',
    ClientEmails: options.clientEmail || '',
    ClientPhones: options.clientPhone || '',
    Language: 1,
    LanguageMarked: 'he',
    IsSendOnCreation: true,
    IsSendSmsOnCreation: options.sendSms ?? false,
    IsSendEmailOnCreation: options.sendEmail ?? true,
    SignaturesConstValues: options.signaturePositions || '',
    SignaturePositionsStr: '',
    SignaturePositionsSlimModel: [],
  }

  if (options.searchWordForSignature) {
    body.SearchWordForMarkingSignature = options.searchWordForSignature
  }
  if (options.isSignatureRoutine) {
    body.SignatureRoutine = true
    body.SignatureRoutineAsync = false // Sequential: signer 1 first, then signer 2
    body.SignatureRoutineSignerNumber = options.signatureRoutineSignerNumber ?? 1
  }
  if (options.routinePrimaryTaskGuid) {
    body.RoutinePrimaryTaskGuid = options.routinePrimaryTaskGuid
  }

  const res = await authFetch('/Tasks/CreateTaskWithFileOption', {
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`2Sign createTaskWithFile failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  if (data.Status === 'failed') {
    throw new Error(`2Sign task creation failed: ${data.Message || data.MessageDescription || 'Unknown'}`)
  }
  const ro = data.ResponseObject || data
  return {
    Guid: ro.TaskGuid || ro.Guid || '',
    TaskId: ro.TaskId || 0,
    Status: data.Status,
    ClientId: ro.ClientId,
  }
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

/** Get task details by GUID via search. */
export async function getTask(guid: string): Promise<TwoSignTaskDetail> {
  const res = await authFetch('/Tasks/GetTasksBySearchParams', {
    body: JSON.stringify({ TaskGuid: guid }),
  })
  if (!res.ok) throw new Error(`2Sign getTask failed: ${res.status}`)
  const data = await res.json()
  const tasks = data.ResponseObject || []
  const task = Array.isArray(tasks) ? tasks.find((t: Record<string, unknown>) => t.TaskGuid === guid) : null
  if (!task) throw new Error(`2Sign task ${guid} not found`)
  return {
    Guid: task.TaskGuid,
    TaskId: task.TaskId || 0,
    Status: task.IsSigned ? 'signed' : 'pending',
    StatusId: task.TaskStatusNumeric || 0,
    ClientId: task.ClientId || 0,
    CreatedDate: task.CreatedOn || '',
    CompletedDate: task.SignedOn,
    TaskTitle: task.TaskSubject,
  }
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
// End-to-End Signing Flow (with PDF marker approach)
// ---------------------------------------------------------------------------

import { addSignatureMarkers } from './pdf-marker'

/**
 * Initiate a signing task with correct signature placement.
 *
 * Flow:
 * 1. Pre-process PDF: add invisible markers at signature positions (pdf-lib)
 * 2. Upload marked PDF to 2Sign
 * 3. Create task with SearchWordForMarkingSignature → places signature at marker
 * 4. For forms requiring counter-sign: create Signature Routine (client → office)
 */
export async function initiateSigning(params: {
  clientName: string
  clientEmail: string
  clientPhone: string
  pdfBuffer: Buffer
  pdfFilename: string
  formType: string  // 'poa-tax-authority' | 'poa-nii-withholdings'
  title: string
  /** Office signer for counter-signature (רשות המיסים only) */
  officeSigner?: { name: string; email: string; clientId?: number }
}): Promise<{ clientTaskGuid: string; officeTaskGuid?: string; clientId: number }> {

  // 1. Add invisible markers to PDF
  const marked = await addSignatureMarkers(params.pdfBuffer, params.formType)

  // 2. Find or create client in 2Sign
  let client = await findClient({ email: params.clientEmail, phone: params.clientPhone })
  if (!client) {
    client = await createClient({
      name: params.clientName,
      email: params.clientEmail,
      phone: params.clientPhone,
    })
  }

  // 3. Upload marked PDF
  const fileGuid = await uploadFile(marked.pdfBuffer, params.pdfFilename)

  // 4. Create client signing task
  const isRoutine = marked.requiresCounterSign && !!params.officeSigner
  const clientTask = await createTaskWithFile({
    clientId: client.ClientId,
    fileGuid,
    clientEmail: params.clientEmail,
    clientPhone: params.clientPhone,
    title: params.title,
    searchWordForSignature: marked.clientMarker,
    sendEmail: true,
    isSignatureRoutine: isRoutine,
    signatureRoutineSignerNumber: isRoutine ? 1 : undefined,
  })

  // 5. If counter-signature needed, create office signer task in routine
  let officeTaskGuid: string | undefined
  if (isRoutine && params.officeSigner) {
    // Find or create office signer
    let officeTwoSignClient = await findClient({ email: params.officeSigner.email })
    if (!officeTwoSignClient) {
      officeTwoSignClient = await createClient({
        name: params.officeSigner.name,
        email: params.officeSigner.email,
      })
    }

    const officeTask = await createTaskWithFile({
      clientId: officeTwoSignClient.ClientId,
      fileGuid,
      clientEmail: params.officeSigner.email,
      title: params.title,
      searchWordForSignature: marked.officeMarker,
      sendEmail: true,
      isSignatureRoutine: true,
      signatureRoutineSignerNumber: 2,
      routinePrimaryTaskGuid: clientTask.Guid,
    })
    officeTaskGuid = officeTask.Guid
  }

  return {
    clientTaskGuid: clientTask.Guid,
    officeTaskGuid,
    clientId: client.ClientId,
  }
}
