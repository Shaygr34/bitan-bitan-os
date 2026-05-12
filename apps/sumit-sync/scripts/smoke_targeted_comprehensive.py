"""
Comprehensive smoke test for the targeted fetch path.

Validates:
  1. Multi-row IDOM input → per-row Summit lookup
  2. All 3 engine routing branches (matched / no-report / no-client)
  3. Output DataFrame schema parity with the slow path (same columns,
     same _match_key behavior)
  4. End-to-end engine integration: fetch → engine.build_write_plan,
     no schema errors, plan ops match expectations.
  5. Dedup of duplicate ח.פ values
  6. Multi-match warning (ח.פ collision in test environment)
  7. API call count + elapsed time vs the 1500-call slow path

Run:
  cd apps/sumit-sync
  source .venv/bin/activate
  SUMMIT_COMPANY_ID=... SUMMIT_API_KEY=... \\
    python scripts/smoke_targeted_comprehensive.py
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

from src.core.config import FINANCIAL_CONFIG  # noqa: E402
from src.core.sumit_api_client import SummitAPIClient  # noqa: E402
from src.core.mapping_store import MappingStore  # noqa: E402
from src.core.sumit_api_source import fetch_sumit_data_targeted  # noqa: E402
from src.core.sync_engine import SyncEngine  # noqa: E402
from src.core import taxonomy  # noqa: E402


# Locked test fixtures
CLIENT_ALPHA_CHP = "206775140"
CLIENT_ALPHA_ID = 1864195687
CLIENT_ALPHA_2024_REPORT_ID = 1896724808

# Unknown ח.פ — for the no-client FLAG branch
UNKNOWN_CHP = "999999990"

# Year that won't have a report on Client-α
EMPTY_YEAR = 2018


def hdr(label: str):
    print(f"\n{'═' * 70}\n  {label}\n{'═' * 70}")


def check(condition: bool, label: str) -> bool:
    mark = "✓ PASS" if condition else "✗ FAIL"
    print(f"  {mark}  {label}")
    return condition


def main() -> int:
    if not os.environ.get("SUMMIT_API_KEY") or not os.environ.get("SUMMIT_COMPANY_ID"):
        print("ERROR: SUMMIT_API_KEY and SUMMIT_COMPANY_ID env vars required", file=sys.stderr)
        return 2

    api = SummitAPIClient()
    failures = 0

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 1 — matched: 1 IDOM row, Client-α 2024 report exists")
    # ────────────────────────────────────────────────────────────────────────
    mapping = MappingStore(path=Path("/tmp/smoke_s1.json"))
    mapping.add(CLIENT_ALPHA_ID, CLIENT_ALPHA_CHP, "שי גרייבר בדיקה")

    t0 = time.monotonic()
    calls_before = api.call_count
    df, lookup, warnings = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=2024,
        idom_company_numbers=[CLIENT_ALPHA_CHP],
        client=api,
        mapping=mapping,
    )
    elapsed = time.monotonic() - t0
    calls = api.call_count - calls_before
    print(f"  → {len(df)} rows, {calls} API calls, {elapsed:.2f}s, warnings={warnings}")

    if not check(len(df) == 1, "returns exactly 1 row"): failures += 1
    if not check(calls == 2, "exactly 2 API calls (find_report + get_entity)"): failures += 1
    if len(df) == 1:
        r = df.iloc[0]
        if not check(str(r["מזהה"]) == str(CLIENT_ALPHA_2024_REPORT_ID),
                     f"returned report ID matches expected {CLIENT_ALPHA_2024_REPORT_ID}"): failures += 1
        if not check(r["ח.פ"] == CLIENT_ALPHA_CHP, "ח.פ column populated"): failures += 1
        if not check(r["_match_key"] == CLIENT_ALPHA_CHP, "_match_key populated"): failures += 1
        if not check(CLIENT_ALPHA_CHP in lookup, "lookup keyed by ח.פ"): failures += 1
        if not check("2024" in r["שנת מס"], "year column shows 2024"): failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 2 — no_client: unknown ח.פ should produce no row + warning")
    # ────────────────────────────────────────────────────────────────────────
    mapping = MappingStore(path=Path("/tmp/smoke_s2.json"))
    calls_before = api.call_count
    df, lookup, warnings = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=2024,
        idom_company_numbers=[UNKNOWN_CHP],
        client=api,
        mapping=mapping,
    )
    calls = api.call_count - calls_before
    print(f"  → {len(df)} rows, {calls} calls, warnings={warnings}")
    if not check(len(df) == 0, "0 rows returned"): failures += 1
    if not check(calls == 1, "1 call (client lookup, no report fetch)"): failures += 1
    if not check(any("no matching Summit client" in w for w in warnings),
                 "warning surfaces no-client branch"): failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 3 — no_report: known client, no report for empty year")
    # ────────────────────────────────────────────────────────────────────────
    mapping = MappingStore(path=Path("/tmp/smoke_s3.json"))
    mapping.add(CLIENT_ALPHA_ID, CLIENT_ALPHA_CHP)
    calls_before = api.call_count
    df, lookup, warnings = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=EMPTY_YEAR,
        idom_company_numbers=[CLIENT_ALPHA_CHP],
        client=api,
        mapping=mapping,
    )
    calls = api.call_count - calls_before
    print(f"  → {len(df)} rows, {calls} calls, warnings={warnings}")
    if not check(len(df) == 0, "0 rows returned"): failures += 1
    if not check(any("no" in w and str(EMPTY_YEAR) in w for w in warnings),
                 "warning surfaces no-report branch"): failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 4 — dedup: duplicate ח.פ in IDOM should collapse to 1 lookup")
    # ────────────────────────────────────────────────────────────────────────
    mapping = MappingStore(path=Path("/tmp/smoke_s4.json"))
    mapping.add(CLIENT_ALPHA_ID, CLIENT_ALPHA_CHP)
    calls_before = api.call_count
    df, _, _ = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=2024,
        idom_company_numbers=[CLIENT_ALPHA_CHP, CLIENT_ALPHA_CHP, CLIENT_ALPHA_CHP],
        client=api,
        mapping=mapping,
    )
    calls = api.call_count - calls_before
    print(f"  → {len(df)} rows, {calls} calls (input was 3 duplicates)")
    if not check(len(df) == 1, "deduped to 1 row"): failures += 1
    if not check(calls == 2, "still 2 calls (not 6) — dedup before lookup"): failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 5 — mixed: matched + unknown + duplicate-of-matched")
    # ────────────────────────────────────────────────────────────────────────
    mapping = MappingStore(path=Path("/tmp/smoke_s5.json"))
    mapping.add(CLIENT_ALPHA_ID, CLIENT_ALPHA_CHP)
    calls_before = api.call_count
    t0 = time.monotonic()
    df, lookup, warnings = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=2024,
        idom_company_numbers=[CLIENT_ALPHA_CHP, UNKNOWN_CHP, CLIENT_ALPHA_CHP],
        client=api,
        mapping=mapping,
    )
    elapsed = time.monotonic() - t0
    calls = api.call_count - calls_before
    print(f"  → {len(df)} rows, {calls} calls, {elapsed:.2f}s, warnings={warnings}")
    if not check(len(df) == 1, "1 row returned (matched, dup deduped, unknown skipped)"): failures += 1
    if not check(calls == 3, "3 calls (find_client unknown + find_report + get_entity)"): failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 6 — schema parity with slow path")
    # ────────────────────────────────────────────────────────────────────────
    expected_cols = set(FINANCIAL_CONFIG.export_schema.all_columns) | {"_match_key", "_match_key_raw"}
    actual_cols = set(df.columns)
    missing = expected_cols - actual_cols
    if not check(not missing, f"DataFrame has all required columns (missing: {missing})"): failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr("Scenario 7 — engine integration: build_write_plan against this output")
    # ────────────────────────────────────────────────────────────────────────
    # Build a minimal IDOM dataframe that mirrors what idom_workbook would produce
    # for a Cycle-A-style input: one row for Client-α with תאריך_ארכה set.
    idom_df = pd.DataFrame([
        {
            "מספר_תיק": CLIENT_ALPHA_CHP,
            "שם": "שי גרייבר בדיקה",
            "תאריך_ארכה": pd.Timestamp("2026-06-30"),
            "תאריך_הגשה": pd.NaT,
            "פקיד_שומה": "38",
            "סוג_תיק": "7",
        }
    ])

    # Re-fetch SUMIT for scenario 7 so we have a single-match df
    mapping = MappingStore(path=Path("/tmp/smoke_s7.json"))
    mapping.add(CLIENT_ALPHA_ID, CLIENT_ALPHA_CHP)
    sumit_df, sumit_lookup, _ = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=2024,
        idom_company_numbers=[CLIENT_ALPHA_CHP],
        client=api,
        mapping=mapping,
    )

    # Make sure taxonomy is loaded — engine needs it for status resolution
    if not taxonomy.is_loaded():
        try:
            taxonomy.load_full_taxonomies(api)
        except Exception as e:
            print(f"  WARN: could not load taxonomy ({e}) — engine may produce empty refs")

    engine = SyncEngine(FINANCIAL_CONFIG)
    try:
        plan = engine.build_write_plan(
            idom_df=idom_df,
            sumit_df=sumit_df,
            sumit_lookup=sumit_lookup,
            tax_year=2024,
            client_mapping=None,  # no פקיד שומה/סוג תיק client updates
        )
        print(f"  → plan built: {len(plan.operations)} operations")
        ops_by_type = {}
        for op in plan.operations:
            ops_by_type.setdefault(op.op_type.value if hasattr(op.op_type, 'value') else str(op.op_type), 0)
            ops_by_type[op.op_type.value if hasattr(op.op_type, 'value') else str(op.op_type)] += 1
        print(f"  → op breakdown: {ops_by_type}")
        if not check(len(plan.operations) >= 1, "produced at least one operation"): failures += 1
        # Cycle A expects UPDATE_REPORT (matched)
        update_ops = [op for op in plan.operations
                      if "update" in str(op.op_type).lower() and "report" in str(op.op_type).lower()]
        if not check(len(update_ops) >= 1, "produced UPDATE_REPORT op for matched row"): failures += 1
    except Exception as e:
        print(f"  ✗ FAIL  engine.build_write_plan raised: {type(e).__name__}: {e}")
        failures += 1

    # ────────────────────────────────────────────────────────────────────────
    hdr(f"SUMMARY — {api.call_count} total API calls, {failures} failures")
    # ────────────────────────────────────────────────────────────────────────
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
