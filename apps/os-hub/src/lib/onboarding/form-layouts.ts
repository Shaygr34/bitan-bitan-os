/**
 * Form layouts — single source of truth for signature/date coordinates on
 * onboarding PDFs (ייפוי כוח, etc.).
 *
 * Two consumers read from this file:
 *   1. pdf-marker.ts — pre-2Sign step: draws invisible markers ("§" for client,
 *      "†" for office) at the marker positions, AND tells 2Sign where to place
 *      the auto-fill date field via SignaturePositions (fieldType: 4).
 *   2. auto-stamp.ts — post-2Sign step: receives the client-signed PDF back,
 *      paints the office signature image + dates directly on the PDF (since
 *      Option C / PR #127, the office is NOT a 2Sign signer anymore — auto-stamp
 *      replaces that step).
 *
 * Why anchor semantics are codified per-field
 * --------------------------------------------
 * pdf-marker.ts and auto-stamp.ts use the same logical positions but with
 * different anchor semantics:
 *   - pdf-marker draws text via pdf-lib's drawText (y = baseline) for the
 *     invisible marker, and sends a RECTANGLE (x, y, width, height) to 2Sign
 *     for the date auto-fill field. 2Sign's y is "from top of page" (per
 *     pdf-marker's prior DatePosition comment).
 *   - auto-stamp paints via pdf-lib's drawImage (y = bottom-left of image) and
 *     drawText (y = baseline). So auto-stamp's "yFromTop" for a date is the
 *     TEXT BASELINE; for the stamp image it's the TOP of the image.
 *
 * These anchors are not interchangeable — that's why fields like clientDate
 * carry BOTH `autoStampTextBaselineFromTop` and `twoSignFieldRectTopFromTop`.
 * The values may differ by 3–10pt and that is correct, not drift.
 *
 * Pre-refactor (May 12, 2026): the same numbers lived in pdf-marker.ts
 * (FORM_POSITIONS) AND auto-stamp.ts (STAMP_LAYOUTS) with no cross-reference.
 * They drifted across PRs #126–#129. Consolidating here makes future drift
 * visible at review time.
 *
 * Coordinate system
 * -----------------
 * - x = points from left of page
 * - all "yFromTop" / "FromTop" fields = points from top of page (NOT pdf-lib's
 *   bottom-up convention). Consumers convert to pdf-lib's bottom-up y via
 *   `height - yFromTop` (or `height - yFromTop - imageHeight` for image
 *   top-anchored placement).
 *
 * Page sizes (for reference)
 * - poa-tax-authority: 612 x 792 (US Letter)
 * - poa-nii-withholdings: 594.96 x 841.92 (A4)
 */

export interface ClientSignaturePosition {
  /** x in points from left of page */
  x: number
  /** y in points from top of page — pdf-marker's drawText baseline */
  yFromTop: number
}

export interface SharedDatePosition {
  /** x in points from left of page (same for both consumers) */
  x: number
  /**
   * y in points from top of page — TEXT BASELINE.
   * Used by auto-stamp.ts when painting the date as a backup
   * (alsoFillClientDate path: when 2Sign's auto-fill missed).
   * Ground truth: Chrome-agent QA, May 12 2026.
   */
  autoStampTextBaselineFromTop: number
  /** Font size for auto-stamp paint */
  autoStampFontSize: number
  /**
   * y in points from top of page — TOP of the 2Sign date-field rectangle.
   * Used by pdf-marker.ts to build the SignaturePositions entry sent to 2Sign
   * (fieldType: 4, auto-fills with signing date).
   */
  twoSignFieldRectTopFromTop: number
  /** Width of the 2Sign date-field rectangle */
  twoSignFieldWidth: number
  /** Height of the 2Sign date-field rectangle */
  twoSignFieldHeight: number
}

export interface OfficeStampPosition {
  /** x = LEFT EDGE of stamp image in points */
  x: number
  /** y in points from top of page = TOP of stamp image */
  yFromTop: number
  /** Stamp image width in points (height derived from PNG aspect ratio) */
  widthPt: number
}

export interface OfficeDatePosition {
  x: number
  /** y in points from top of page — TEXT BASELINE for auto-stamp's drawText */
  yFromTop: number
  fontSize: number
}

export interface FormLayout {
  /** Client signature marker position (pdf-marker only) */
  clientSignature: ClientSignaturePosition

  /**
   * Client date — read by BOTH pdf-marker (2Sign auto-fill field) AND
   * auto-stamp (backup paint when 2Sign auto-fill missed).
   * Single logical position, two anchor projections.
   */
  clientDate: SharedDatePosition

  /**
   * Office stamp image — auto-stamp only.
   * Forms with this set use auto-stamp (Option C / PR #127). For these forms
   * the office is NOT a 2Sign signer, so pdf-marker does NOT draw an office
   * marker and does NOT tell 2Sign about any office signature.
   * Forms without this set (e.g. poa-nii-withholdings — employer signs alone)
   * skip office stamping entirely.
   */
  officeStamp?: OfficeStampPosition

  /** Office date — paired with officeStamp (auto-stamp only). */
  officeDate?: OfficeDatePosition
}

/**
 * Layouts per form type.
 *
 * Values cross-referenced and validated against the actual PDFs:
 *   tax-authority.pdf (Letter 612 x 792) — Chrome-agent QA record 1903144037 (2026-05-12)
 *   btl-nikuyim.pdf   (A4 594.96 x 841.92) — no office counter-sign (employer signs alone)
 */
export const FORM_LAYOUTS: Record<string, FormLayout> = {
  // רשות המיסים ייפוי כוח — section א (client) + section ב (office stamp via auto-stamp)
  'poa-tax-authority': {
    clientSignature: { x: 220, yFromTop: 430 }, // חתימת בן זוג רשום/העוסק
    clientDate: {
      x: 420,
      // auto-stamp Chrome-QA: lands ON the section-א תאריך underline
      autoStampTextBaselineFromTop: 422,
      autoStampFontSize: 11,
      // 2Sign date-field rectangle — historically tuned via 2Sign field semantics
      twoSignFieldRectTopFromTop: 432,
      twoSignFieldWidth: 70,
      twoSignFieldHeight: 18,
    },
    officeStamp: {
      // Chrome-QA: office stamp cell ("חתימה וחותמת") centered at x≈260; width 95 → left edge 213
      x: 213,
      yFromTop: 540,
      widthPt: 95,
    },
    officeDate: {
      x: 420,
      // Chrome-QA: lands ON the section-ב תאריך underline
      yFromTop: 605,
      fontSize: 11,
    },
  },

  // ביטוח לאומי ניכויים — employer signs alone, no office counter-stamp
  'poa-nii-withholdings': {
    clientSignature: { x: 150, yFromTop: 539 }, // חתימת המעסיק/ה
    clientDate: {
      x: 350,
      autoStampTextBaselineFromTop: 542,
      autoStampFontSize: 11,
      twoSignFieldRectTopFromTop: 539,
      twoSignFieldWidth: 80,
      twoSignFieldHeight: 20,
    },
    // No officeStamp / officeDate — employer signs alone.
  },
}

/** Whether a form type uses auto-stamp (i.e. has an office counter-stamp). */
export function formNeedsAutoStamp(formType: string): boolean {
  return !!FORM_LAYOUTS[formType]?.officeStamp
}

/** List of supported form types. */
export function getSupportedFormTypes(): string[] {
  return Object.keys(FORM_LAYOUTS)
}
