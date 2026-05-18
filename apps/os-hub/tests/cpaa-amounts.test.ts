/**
 * Unit tests for the CPAA amount model (הערה-א' / הערה-ב' invariant).
 *
 * Run: node --experimental-strip-types --test tests/cpaa-amounts.test.ts
 *
 * Convention (same as transitions.test.ts): logic duplicated inline so the
 * test runs without module resolution through the experimental loader. If it
 * drifts from src/lib/cpaa/amounts.ts, that's a signal to update both.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface CpaaAmountState {
  rawAmount: number | null;
  noteA: number;
  noteB: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function computeNoteB(rawAmount: number | null, noteA: number): number | null {
  if (rawAmount === null && noteA === 0) return null;
  return round2((rawAmount ?? 0) + noteA);
}

function applyRawAmount(prev: CpaaAmountState, newRaw: number | null): CpaaAmountState {
  const rawAmount = newRaw === null ? null : round2(newRaw);
  return { rawAmount, noteA: prev.noteA, noteB: computeNoteB(rawAmount, prev.noteA) };
}

function setNoteA(prev: CpaaAmountState, newNoteA: number): CpaaAmountState {
  const noteA = round2(newNoteA);
  return { rawAmount: prev.rawAmount, noteA, noteB: computeNoteB(prev.rawAmount, noteA) };
}

const empty: CpaaAmountState = { rawAmount: null, noteA: 0, noteB: null };

describe("computeNoteB", () => {
  it("raw + noteA", () => {
    assert.equal(computeNoteB(1000, 50), 1050);
  });

  it("no raw and no adjustment → null (genuinely no data)", () => {
    assert.equal(computeNoteB(null, 0), null);
  });

  it("manual-only adjustment (no raw) still yields a number", () => {
    assert.equal(computeNoteB(null, -120), -120);
  });

  it("negative adjustment lowers the total", () => {
    assert.equal(computeNoteB(5000, -250), 4750);
  });

  it("rounds to 2 decimals, no float drift", () => {
    assert.equal(computeNoteB(0.1, 0.2), 0.3);
    assert.equal(computeNoteB(1000.005, 0), 1000.01);
  });
});

describe("הערה-א' invariant under re-import", () => {
  it("a re-import overwrites raw, recomputes הערה ב', PRESERVES הערה א'", () => {
    let s = applyRawAmount(empty, 1000);
    s = setNoteA(s, 50); // human sets the free adjustment
    assert.deepEqual(s, { rawAmount: 1000, noteA: 50, noteB: 1050 });

    // מיכפל re-upload → new raw
    s = applyRawAmount(s, 1200);
    assert.equal(s.rawAmount, 1200);
    assert.equal(s.noteA, 50, "הערה א' must survive the re-import");
    assert.equal(s.noteB, 1250, "הערה ב' recomputes from new raw + preserved noteA");
  });

  it("survives MANY re-import cycles without drift or noteA loss", () => {
    let s = setNoteA(applyRawAmount(empty, 333.33), 11.11);
    for (const r of [400.4, 999.99, 0.07, 12345.67, 1000]) {
      s = applyRawAmount(s, r);
      assert.equal(s.noteA, 11.11, `noteA preserved through raw=${r}`);
      assert.equal(s.noteB, round2(r + 11.11));
    }
  });

  it("editing הערה א' never touches raw", () => {
    let s = applyRawAmount(empty, 8000);
    s = setNoteA(s, 300);
    s = setNoteA(s, -75);
    assert.equal(s.rawAmount, 8000);
    assert.equal(s.noteA, -75);
    assert.equal(s.noteB, 7925);
  });

  it("clearing raw (null) keeps הערה א' and reflects manual-only total", () => {
    let s = setNoteA(applyRawAmount(empty, 600), 40);
    s = applyRawAmount(s, null);
    assert.equal(s.rawAmount, null);
    assert.equal(s.noteA, 40);
    assert.equal(s.noteB, 40);
  });
});
