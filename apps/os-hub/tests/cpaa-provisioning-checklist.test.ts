/**
 * Unit tests for the CPAA VAT-slice provisioning checklist.
 *
 * Run: node --experimental-strip-types --test tests/cpaa-provisioning-checklist.test.ts
 *
 * Convention (same as transitions.test.ts): the build logic + the known
 * `create` registry rows are duplicated inline so tests run without module
 * resolution through the experimental loader. If these drift from
 * src/lib/cpaa/{summit-cpaa-fields,provisioning-checklist}.ts, update both.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const CPAA_FOLDERS = { clients: 557688522, books: 557689484 } as const;
const FOLDER_NAMES: Record<number, string> = {
  [CPAA_FOLDERS.clients]: "לקוחות",
  [CPAA_FOLDERS.books]: "תיקי הנהלת חשבונות",
};

// The two `create` rows from summit-cpaa-fields.ts (VAT slice).
interface CreateRow {
  dataPoint: string;
  folder: "clients" | "books";
  valueType: string;
  category: string;
  notes: string;
}
const CREATE_ROWS: CreateRow[] = [
  { dataPoint: "העדפה שליחת סכומים", folder: "clients", valueType: "Enum", category: "שליחת סכומים", notes: "channel pref" },
  { dataPoint: 'הערות סכומים — מע"מ', folder: "clients", valueType: "LongText", category: "הערות סכומים", notes: "constant default note" },
];

const ENUM_OPTIONS: Record<string, string[]> = {
  "העדפה שליחת סכומים": ["SMS", "whatsapp", 'דוא"ל'],
};

function buildChecklist() {
  return CREATE_ROWS.map((spec) => {
    const fId = spec.folder === "books" ? CPAA_FOLDERS.books : CPAA_FOLDERS.clients;
    const opts = ENUM_OPTIONS[spec.dataPoint];
    const isEnum = spec.valueType === "Enum";
    return {
      fieldName: spec.dataPoint,
      folderId: fId,
      folderName: FOLDER_NAMES[fId],
      category: spec.category,
      summitFieldType: spec.valueType,
      enumOptions: isEnum && opts ? opts : undefined,
      adminInstruction:
        isEnum && opts
          ? `בתיקיית "${FOLDER_NAMES[fId]}" → קטגוריה "${spec.category}": צור שדה מסוג רשימה בשם "${spec.dataPoint}" עם הערכים: ${opts.join(" · ")}.`
          : `בתיקיית "${FOLDER_NAMES[fId]}" → קטגוריה "${spec.category}": צור שדה מסוג ${spec.valueType} בשם "${spec.dataPoint}".`,
      rationale: spec.notes,
    };
  });
}

describe("CPAA VAT-slice provisioning checklist", () => {
  it("emits exactly the 2 VAT-slice create fields", () => {
    const steps = buildChecklist();
    assert.equal(steps.length, 2);
    assert.deepEqual(
      steps.map((s) => s.fieldName).sort(),
      ['הערות סכומים — מע"מ', "העדפה שליחת סכומים"].sort(),
    );
  });

  it("both fields target the לקוחות folder (557688522)", () => {
    for (const s of buildChecklist()) {
      assert.equal(s.folderId, 557688522);
      assert.equal(s.folderName, "לקוחות");
    }
  });

  it("the channel-preference field is a dropdown with the 3 exact options", () => {
    const pref = buildChecklist().find((s) => s.fieldName === "העדפה שליחת סכומים")!;
    assert.equal(pref.summitFieldType, "Enum");
    assert.deepEqual(pref.enumOptions, ["SMS", "whatsapp", 'דוא"ל']);
    assert.match(pref.adminInstruction, /רשימה/);
    assert.match(pref.adminInstruction, /SMS · whatsapp · דוא"ל/);
  });

  it("the notes field is LongText with no options", () => {
    const note = buildChecklist().find((s) => s.fieldName === 'הערות סכומים — מע"מ')!;
    assert.equal(note.summitFieldType, "LongText");
    assert.equal(note.enumOptions, undefined);
  });

  it("every step carries a folder, category and admin instruction", () => {
    for (const s of buildChecklist()) {
      assert.ok(s.folderId > 0);
      assert.ok(s.category.length > 0);
      assert.ok(s.adminInstruction.includes(s.fieldName));
      assert.ok(s.adminInstruction.includes(s.category));
    }
  });
});
