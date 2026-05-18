/**
 * Turnkey Summit-admin provisioning checklist for the CPAA VAT slice.
 *
 * Summit's API is value-level only — there is no field-creation endpoint
 * (confirmed from the working repo + the Phase-0 probe). So every `create`
 * row in `summit-cpaa-fields.ts` is a one-time MANUAL task someone does in the
 * Summit admin UI before the OS can read/write it. This module turns those
 * rows into an exact, human-actionable Hebrew checklist (the office acts in a
 * Hebrew Summit UI). Mirrors the onboarding `field-provisioning-plan.ts`
 * intent: machine-derived worklist, human executor.
 *
 * Pure + unwired: metadata only, no Summit calls. After the fields exist, a
 * later step runs `getfolderschema` + `listentities` to capture the new field
 * names + dropdown option entity-IDs (seed §4.3) — that is NOT done here.
 */

import {
  CPAA_FOLDERS,
  getCpaaProvisioningWorklist,
  type CpaaFieldSpec,
} from "./summit-cpaa-fields";

export interface CpaaProvisioningStep {
  /** Hebrew data point as it should be named in Summit. */
  fieldName: string;
  /** Target Summit folder id + Hebrew name. */
  folderId: number;
  folderName: string;
  /** Summit category (UI grouping) the field should be created under. */
  category: string;
  /** Summit field type to choose in the admin UI. */
  summitFieldType: CpaaFieldSpec["valueType"];
  /** For dropdown/Enum fields: the exact option labels to create, in order. */
  enumOptions?: string[];
  /** One-line Hebrew instruction for whoever provisions it. */
  adminInstruction: string;
  /** Why the OS needs it (kept short — traceability). */
  rationale: string;
}

const FOLDER_NAMES: Record<number, string> = {
  [CPAA_FOLDERS.clients]: "לקוחות",
  [CPAA_FOLDERS.books]: 'תיקי הנהלת חשבונות',
};

/** Option sets for the VAT-slice dropdown fields (labels only — IDs fetched post-creation). */
const ENUM_OPTIONS: Record<string, string[]> = {
  "העדפה שליחת סכומים": ["SMS", "whatsapp", 'דוא"ל'],
};

function folderId(spec: CpaaFieldSpec): number {
  return spec.folder === "books" ? CPAA_FOLDERS.books : CPAA_FOLDERS.clients;
}

/** Build the ordered provisioning checklist for the VAT slice (the 2 create rows). */
export function buildCpaaProvisioningChecklist(): CpaaProvisioningStep[] {
  return getCpaaProvisioningWorklist().map((spec) => {
    const fId = folderId(spec);
    const opts = ENUM_OPTIONS[spec.dataPoint];
    const isEnum = spec.valueType === "Enum";
    return {
      fieldName: spec.dataPoint,
      folderId: fId,
      folderName: FOLDER_NAMES[fId],
      category: spec.category,
      summitFieldType: spec.valueType,
      ...(isEnum && opts ? { enumOptions: opts } : {}),
      adminInstruction: isEnum && opts
        ? `בתיקיית "${FOLDER_NAMES[fId]}" → קטגוריה "${spec.category}": צור שדה מסוג רשימה בשם "${spec.dataPoint}" עם הערכים: ${opts.join(" · ")}.`
        : `בתיקיית "${FOLDER_NAMES[fId]}" → קטגוריה "${spec.category}": צור שדה מסוג ${spec.valueType} בשם "${spec.dataPoint}".`,
      rationale: spec.notes ?? "",
    };
  });
}

/** Render the checklist as a turnkey numbered Hebrew text block for the office. */
export function renderCpaaProvisioningChecklistText(): string {
  const steps = buildCpaaProvisioningChecklist();
  const lines: string[] = [
    'רשימת הקמת שדות ב-Summit — פרוסת מע"מ (CPAA)',
    `סה"כ ${steps.length} שדות. הקמה חד-פעמית ב-Summit admin; ה-OS כותב/קורא ערכים לאחר מכן.`,
    "",
  ];
  steps.forEach((s, idx) => {
    lines.push(`${idx + 1}. ${s.fieldName}  [${s.summitFieldType}]`);
    lines.push(`   תיקייה: ${s.folderName} (${s.folderId}) · קטגוריה: ${s.category}`);
    if (s.enumOptions) lines.push(`   ערכי רשימה: ${s.enumOptions.join(" · ")}`);
    lines.push(`   ${s.adminInstruction}`);
    if (s.rationale) lines.push(`   הסבר: ${s.rationale}`);
    lines.push("");
  });
  lines.push(
    'לאחר ההקמה: ה-OS ירוץ getfolderschema + listentities לשליפת שמות השדות ומזהי-האפשרויות (seed §4.3).',
  );
  return lines.join("\n");
}
