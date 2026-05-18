/**
 * Unit tests for the CPAA colour state machine.
 *
 * Uses Node.js built-in test runner + --experimental-strip-types.
 * Run: node --experimental-strip-types --test tests/cpaa-state-machine.test.ts
 *
 * Convention (same as transitions.test.ts): the map + logic are duplicated
 * inline so tests run without the Prisma client installed. If these drift from
 * src/lib/cpaa/state-machine.ts, that's a signal to update both.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Inline the transition map (same as state-machine.ts) ────────────────────

const CPAA_COLOUR_TRANSITIONS: Record<string, string[]> = {
  GRAY: ["ORANGE"],
  ORANGE: ["YELLOW", "PURPLE", "GRAY"],
  YELLOW: ["PURPLE", "ORANGE"],
  PURPLE: ["BLUE", "YELLOW"],
  BLUE: ["GREEN", "PURPLE"],
  GREEN: [],
};

function validateColourTransition(from: string, to: string) {
  if (CPAA_COLOUR_TRANSITIONS[from]?.includes(to)) return null;
  return { code: "INVALID_TRANSITION", message: `CPAA report cannot transition from ${from} to ${to}`, from, to };
}

// ── Inline the derivation (same logic as state-machine.ts) ──────────────────

interface ColourDeriveInput {
  materialsReceived: boolean;
  rawAmountPresent: boolean;
  completionsDone: boolean;
  approved: boolean;
  summitFiledDate: Date | null;
  periodEnd: Date;
  clientMessageSent: boolean;
}

function deriveColourState(i: ColourDeriveInput): string {
  if (i.clientMessageSent) return "GREEN";
  if (i.summitFiledDate && i.summitFiledDate.getTime() >= i.periodEnd.getTime()) return "BLUE";
  if (i.approved) return "PURPLE";
  if (i.rawAmountPresent && i.completionsDone) return "YELLOW";
  if (i.rawAmountPresent || i.materialsReceived) return "ORANGE";
  return "GRAY";
}

const base: ColourDeriveInput = {
  materialsReceived: false,
  rawAmountPresent: false,
  completionsDone: false,
  approved: false,
  summitFiledDate: null,
  periodEnd: new Date("2026-04-30"),
  clientMessageSent: false,
};

// ── Transitions ─────────────────────────────────────────────────────────────

describe("CPAA colour transitions", () => {
  it("GRAY → ORANGE is allowed", () => {
    assert.equal(validateColourTransition("GRAY", "ORANGE"), null);
  });

  it("ORANGE → YELLOW / PURPLE / GRAY are allowed", () => {
    for (const to of ["YELLOW", "PURPLE", "GRAY"]) {
      assert.equal(validateColourTransition("ORANGE", to), null, `ORANGE → ${to}`);
    }
  });

  it("PURPLE → BLUE is allowed", () => {
    assert.equal(validateColourTransition("PURPLE", "BLUE"), null);
  });

  it("BLUE → GREEN is allowed", () => {
    assert.equal(validateColourTransition("BLUE", "GREEN"), null);
  });

  it("GRAY → GREEN is NOT allowed (no skipping the chain)", () => {
    const err = validateColourTransition("GRAY", "GREEN");
    assert.notEqual(err, null);
    assert.equal(err!.code, "INVALID_TRANSITION");
  });

  it("PURPLE → GREEN is NOT allowed (must go through BLUE)", () => {
    assert.notEqual(validateColourTransition("PURPLE", "GREEN"), null);
  });

  it("GREEN is terminal (full closure — no declared outgoing moves)", () => {
    for (const to of ["GRAY", "ORANGE", "YELLOW", "PURPLE", "BLUE"]) {
      assert.notEqual(validateColourTransition("GREEN", to), null, `GREEN → ${to} should be blocked`);
    }
  });

  it("transition map covers all six colour states", () => {
    const expected = ["BLUE", "GRAY", "GREEN", "ORANGE", "PURPLE", "YELLOW"];
    assert.deepEqual(Object.keys(CPAA_COLOUR_TRANSITIONS).sort(), expected);
  });
});

// ── Derivation — the locked business rules ──────────────────────────────────

describe("CPAA colour derivation", () => {
  it("no data → GRAY", () => {
    assert.equal(deriveColourState(base), "GRAY");
  });

  it("materials received (Summit proxy) → ORANGE", () => {
    assert.equal(deriveColourState({ ...base, materialsReceived: true }), "ORANGE");
  });

  it("raw amount present → ORANGE", () => {
    assert.equal(deriveColourState({ ...base, rawAmountPresent: true }), "ORANGE");
  });

  it("raw + completions → YELLOW", () => {
    assert.equal(
      deriveColourState({ ...base, rawAmountPresent: true, completionsDone: true }),
      "YELLOW",
    );
  });

  it("approved (OS-owned manual) → PURPLE", () => {
    assert.equal(
      deriveColourState({ ...base, rawAmountPresent: true, completionsDone: true, approved: true }),
      "PURPLE",
    );
  });

  it("LOCKED #1: Summit filed-date ≥ periodEnd → BLUE (the only Summit-derived state)", () => {
    assert.equal(
      deriveColourState({ ...base, approved: true, summitFiledDate: new Date("2026-04-30") }),
      "BLUE",
    );
  });

  it("filed-date BEFORE periodEnd does NOT trigger BLUE (stays PURPLE)", () => {
    assert.equal(
      deriveColourState({ ...base, approved: true, summitFiledDate: new Date("2026-04-29") }),
      "PURPLE",
    );
  });

  it("BLUE outranks PURPLE (filed beats approved-but-not-filed)", () => {
    assert.equal(
      deriveColourState({ ...base, approved: false, summitFiledDate: new Date("2026-05-10") }),
      "BLUE",
    );
  });

  it("LOCKED #3: client message sent → GREEN, outranking everything", () => {
    assert.equal(
      deriveColourState({
        ...base,
        clientMessageSent: true,
        summitFiledDate: new Date("2026-05-10"),
        approved: true,
        rawAmountPresent: true,
      }),
      "GREEN",
    );
  });

  it("derived state is always a valid colour", () => {
    const valid = new Set(["GRAY", "ORANGE", "YELLOW", "PURPLE", "BLUE", "GREEN"]);
    const cases: Partial<ColourDeriveInput>[] = [
      {},
      { materialsReceived: true },
      { rawAmountPresent: true, completionsDone: true },
      { approved: true },
      { summitFiledDate: new Date("2026-05-01") },
      { clientMessageSent: true },
    ];
    for (const c of cases) {
      assert.ok(valid.has(deriveColourState({ ...base, ...c })));
    }
  });
});
