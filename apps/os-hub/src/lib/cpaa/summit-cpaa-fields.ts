/**
 * CPAA ("מסך CPA") ↔ Summit field registry — VAT (מע"מ) POC slice.
 *
 * Typed source of truth for the editing layer, scoped to the locked POC slice
 * (VAT only). Every row is mapped to a REAL Summit field, classified by how
 * the OS obtains it. Mirrors the proven `summit-onboarding-fields.ts` pattern.
 *
 * Field IDs are GROUND TRUTH from two live pulls on 2026-05-18:
 *  - לקוחות folder 557688522 (via the onboarding registry, same session)
 *  - תיקי הנהלת חשבונות folder 557689484 (the CPAA Phase-0 read-only probe)
 *
 * `provisioning` classifies each row:
 *  - 'exists'  — the Summit field is live today; the OS READS it on demand via
 *                /crm/data/getentity/ + listentities (rate-limited client).
 *  - 'create'  — no Summit home. Summit's API is value-level only (no
 *                field-creation endpoint — confirmed from the working repo), so
 *                this is a one-time MANUAL task in the Summit admin UI.
 *                `getCpaaProvisioningWorklist()` emits exactly these rows.
 *  - 'os-side' — deliberately NOT a Summit field. Lives in the OS-owned ledger
 *                (Prisma CpaaClient/CpaaReport/CpaaMessage). This is the §3
 *                LOCKED "new data Summit deliberately does not hold" — NOT a
 *                forbidden mirror.
 *
 * KEY PHASE-0 FINDING encoded here: the Summit bookkeeping-file entity has NO
 * per-period report-card status field. The spec's סגול/כחול "read from Summit"
 * premise is not buildable as written. The ONLY Summit-readable signal in the
 * whole colour chain is `Books_LastVATHistoryDate` (the BLUE/שודר-ושולם source,
 * reliable because the firm files VAT 100% inside Summit — locked decision #1).
 * Everything else in the chain is OS-owned. See `state-machine.ts`.
 *
 * Nothing in this module performs reads/writes; it is metadata + worklist
 * builders, exactly like the onboarding registry.
 */

export type CpaaProvisioning = "exists" | "create" | "os-side";

export type CpaaSummitFolder = "clients" | "books" | null;

export interface CpaaFieldSpec {
  /** Human data point (Hebrew), as the spec / cockpit names it. */
  dataPoint: string;
  /** Summit field Name/APIName used as the Properties key. Null when not in Summit. */
  summitApiName: string | null;
  /** Summit field ID from the live schema, for traceability. Null when not in Summit. */
  summitFieldId: number | null;
  /** Which Summit folder the field lives in. */
  folder: CpaaSummitFolder;
  valueType:
    | "ShortText"
    | "LongText"
    | "RichText"
    | "Int64"
    | "Decimal"
    | "Date"
    | "Month"
    | "Boolean"
    | "Entity"
    | "Enum";
  /** Summit category (UI grouping), or the target category for 'create' rows. */
  category: string;
  provisioning: CpaaProvisioning;
  /** Always true here — this registry is the VAT slice. Kept for parity + future widening. */
  inVatSlice: boolean;
  notes?: string;
}

/** Summit folder IDs (reuse — do not rediscover). */
export const CPAA_FOLDERS = {
  clients: 557688522, // לקוחות
  books: 557689484, // תיקי הנהלת חשבונות
} as const;

export const CPAA_FIELDS: CpaaFieldSpec[] = [
  // ─── EXISTS — read on demand from לקוחות (live IDs via the onboarding registry) ───
  { dataPoint: "שם לקוח", summitApiName: "Customers_FullName", summitFieldId: 557688525, folder: "clients", valueType: "ShortText", category: "פרטים אישיים", provisioning: "exists", inVatSlice: true },
  { dataPoint: "פלאפון", summitApiName: "Customers_Phone", summitFieldId: 557688527, folder: "clients", valueType: "ShortText", category: "פרטים אישיים", provisioning: "exists", inVatSlice: true, notes: "Normalised to <972...>@c.us for Green API." },
  { dataPoint: 'דוא"ל', summitApiName: "Customers_EmailAddress", summitFieldId: 557688528, folder: "clients", valueType: "ShortText", category: "פרטים אישיים", provisioning: "exists", inVatSlice: true },
  { dataPoint: "סוג לקוח", summitApiName: "סוג לקוח", summitFieldId: 1099290845, folder: "clients", valueType: "Entity", category: "פרטים כלליים", provisioning: "exists", inVatSlice: true, notes: "Entity-ref; resolve label↔ID via sumit-lookups CLIENT_TYPE_OPTIONS." },
  { dataPoint: "מנהל תיק", summitApiName: "מנהל תיק", summitFieldId: 1157966329, folder: "clients", valueType: "Entity", category: "פרטים כלליים", provisioning: "exists", inVatSlice: true, notes: "Filter facet (אבי / רון). sumit-lookups ACCOUNT_MANAGER_OPTIONS." },
  { dataPoint: "מספר לקוח", summitApiName: "מספר לקוח", summitFieldId: 1081758647, folder: "clients", valueType: "Int64", category: "פרטים כלליים", provisioning: "exists", inVatSlice: true },

  // ─── EXISTS — read on demand from תיקי הנהלת חשבונות (live IDs from the Phase-0 probe) ───
  { dataPoint: "join לקוח↔תיק הנה\"ח", summitApiName: "Books_Customer", summitFieldId: 557689909, folder: "books", valueType: "Entity", category: "תיק הנה\"ח", provisioning: "exists", inVatSlice: true, notes: "The join from a bookkeeping file back to its לקוחות entity." },
  { dataPoint: 'תדירות דיווח למע"מ', summitApiName: "Books_VATInterval", summitFieldId: 557689896, folder: "books", valueType: "Enum", category: "תיק הנה\"ח", provisioning: "exists", inVatSlice: true, notes: "Drives the period calendar (monthly vs דו-חודשי) — resolves gap #10 for VAT." },
  { dataPoint: 'תאריך דיווח אחרון למע"מ', summitApiName: "Books_LastVATHistoryDate", summitFieldId: 557689913, folder: "books", valueType: "Date", category: "תיק הנה\"ח", provisioning: "exists", inVatSlice: true, notes: "THE BLUE/שודר-ושולם source. Reliable because the firm files VAT 100% in Summit (locked #1). Snapshotted into CpaaReport.summitFiledDate." },
  { dataPoint: "החודש האחרון עבורו התקבלו חומרים", summitApiName: "Books_LastReceivedDocuments", summitFieldId: 557689917, folder: "books", valueType: "Month", category: "תיק הנה\"ח", provisioning: "exists", inVatSlice: true, notes: "Weak proxy for GRAY→ORANGE (materials received) only — not the VAT amount." },

  // ─── CREATE — one-time MANUAL Summit-admin task (the VAT-slice subset of seed §4.7) ───
  { dataPoint: "העדפה שליחת סכומים", summitApiName: null, summitFieldId: null, folder: "clients", valueType: "Enum", category: "שליחת סכומים", provisioning: "create", inVatSlice: true, notes: "Enum: SMS / whatsapp / דוא\"ל. Picks the message channel per client → CpaaClient.channelPref. Default whatsapp until provisioned." },
  { dataPoint: 'הערות סכומים — מע"מ', summitApiName: null, summitFieldId: null, folder: "clients", valueType: "LongText", category: "הערות סכומים", provisioning: "create", inVatSlice: true, notes: "Constant per-client default office note for VAT; auto-prefills CpaaReport.internalNote. Ad-hoc edits stay OS-side and do NOT write back to this constant." },

  // ─── OS-SIDE — the OS-owned ledger; explicitly NOT Summit fields (§3 LOCKED) ───
  { dataPoint: 'סכום גלם מע"מ', summitApiName: null, summitFieldId: null, folder: null, valueType: "Decimal", category: "(OS — CpaaReport.rawAmount)", provisioning: "os-side", inVatSlice: true, notes: "No per-period VAT amount field exists in Summit (Phase-0 finding). Manual entry for the slice; importer is fast-follow." },
  { dataPoint: "הערה א' (תיקון חופשי)", summitApiName: null, summitFieldId: null, folder: null, valueType: "Decimal", category: "(OS — CpaaReport.noteA)", provisioning: "os-side", inVatSlice: true, notes: "Free ±. Invariant: NEVER overwritten by re-import." },
  { dataPoint: "הערה ב' (סכום לתשלום)", summitApiName: null, summitFieldId: null, folder: null, valueType: "Decimal", category: "(OS — CpaaReport.noteB)", provisioning: "os-side", inVatSlice: true, notes: "Computed = raw + הערה א'. The number sent to the client." },
  { dataPoint: "מצב צבע", summitApiName: null, summitFieldId: null, folder: null, valueType: "Enum", category: "(OS — CpaaReport.colourState)", provisioning: "os-side", inVatSlice: true, notes: "OS-owned state machine; only BLUE is Summit-derived. See state-machine.ts." },
  { dataPoint: "הערה פנימית (מופע)", summitApiName: null, summitFieldId: null, folder: null, valueType: "LongText", category: "(OS — CpaaReport.internalNote)", provisioning: "os-side", inVatSlice: true, notes: "Per-report office note instance; never sent to client." },
  { dataPoint: "סטטוס שליחה + חותמת זמן", summitApiName: null, summitFieldId: null, folder: null, valueType: "Enum", category: "(OS — CpaaMessage)", provisioning: "os-side", inVatSlice: true, notes: "Green API send-state + idMessage + sentAt. GREEN trigger." },
];

/**
 * The human worklist: Summit fields someone must create ONCE in the Summit
 * admin UI before the OS can read/write them. For the VAT slice this is small
 * by design (2 rows) — the bulk of seed §4.7 belongs to other report types.
 */
export function getCpaaProvisioningWorklist(): CpaaFieldSpec[] {
  return CPAA_FIELDS.filter((f) => f.provisioning === "create");
}

/** Summit fields the OS can read on demand today (no provisioning needed). */
export function getCpaaReadableToday(): CpaaFieldSpec[] {
  return CPAA_FIELDS.filter((f) => f.provisioning === "exists");
}

/** Data the OS owns in its ledger (deliberately not Summit). */
export function getCpaaOsOwned(): CpaaFieldSpec[] {
  return CPAA_FIELDS.filter((f) => f.provisioning === "os-side");
}
