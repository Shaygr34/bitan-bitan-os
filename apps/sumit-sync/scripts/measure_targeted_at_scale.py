"""
Measure fetch_sumit_data_targeted against a realistic IDOM subset.

Reads the actual SHAAM annual-reports XLSX, takes the first N rows,
runs the integrated targeted fetch, and reports per-row wall time +
API call count. The point is to surface real rate-limiter behavior
at a sample size that exercises the batch cooldown (which kicks in
at 60 calls in sumit_api_client.py).

Run:
  cd apps/sumit-sync
  source .venv/bin/activate
  SUMMIT_COMPANY_ID=... SUMMIT_API_KEY=... \
    python scripts/measure_targeted_at_scale.py [N]

Default N=30 (≈ 60 calls = 1 batch boundary).
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

from src.core.config import ANNUAL_CONFIG  # noqa: E402
from src.core.idom_parser import parse_idom_file  # noqa: E402
from src.core.sumit_api_client import SummitAPIClient  # noqa: E402
from src.core.mapping_store import MappingStore  # noqa: E402
from src.core.sumit_api_source import fetch_sumit_data_targeted  # noqa: E402


IDOM_PATH = "/Users/shay/Downloads/idom_annual_reports_2024.xlsx"
TAX_YEAR = 2024


def main() -> int:
    if not os.environ.get("SUMMIT_API_KEY") or not os.environ.get("SUMMIT_COMPANY_ID"):
        print("ERROR: SUMMIT_API_KEY and SUMMIT_COMPANY_ID required", file=sys.stderr)
        return 2

    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30

    if not Path(IDOM_PATH).exists():
        print(f"ERROR: IDOM file not found at {IDOM_PATH}", file=sys.stderr)
        return 2

    # Parse real IDOM
    idom_df, _, _ = parse_idom_file(IDOM_PATH)
    print(f"Full IDOM: {len(idom_df)} rows")
    print(f"Sampling first {n} rows for measurement")

    # Take first N rows
    subset = idom_df.head(n)
    chp_values = [str(v).strip() for v in subset["מספר_תיק"].dropna().tolist() if str(v).strip()]
    unique_chp = list(set(chp_values))
    print(f"  {len(chp_values)} non-empty ח.פ values, {len(unique_chp)} unique")

    # Use a fresh in-memory mapping (no Railway volume on local Mac)
    # → simulates a true cold start for THIS subset
    api = SummitAPIClient()
    mapping = MappingStore(path=Path("/tmp/measure_scale_mapping.json"))

    print(f"\n=== Running targeted fetch for {n} rows ===")
    t0 = time.monotonic()
    calls_before = api.call_count
    df, lookup, warnings = fetch_sumit_data_targeted(
        config=ANNUAL_CONFIG,
        tax_year=TAX_YEAR,
        idom_company_numbers=chp_values,
        client=api,
        mapping=mapping,
    )
    elapsed = time.monotonic() - t0
    calls = api.call_count - calls_before

    matched = len(df)
    no_client = sum(1 for w in warnings if "no matching Summit client" in w)
    no_report = sum(1 for w in warnings if "no" in w.lower() and "report" in w.lower())

    print(f"\n=== Results ===")
    print(f"  Wall time:        {elapsed:.1f}s")
    print(f"  API calls:        {calls}")
    print(f"  Matched rows:     {matched}")
    print(f"  Unique inputs:    {len(unique_chp)}")
    print(f"  Warnings:         {len(warnings)}")
    if warnings:
        print(f"    sample: {warnings[:3]}")

    if matched > 0:
        print(f"\n=== Per-row averages ===")
        print(f"  sec/unique-input: {elapsed/len(unique_chp):.2f}")
        print(f"  calls/unique-input: {calls/len(unique_chp):.2f}")

        # Extrapolate to Guy's full file (~715 rows ≈ ~700 unique ח.פ)
        print(f"\n=== Extrapolation to 715-row IDOM file ===")
        if len(unique_chp) > 0:
            scale = 715 / len(unique_chp)
            est_calls = calls * scale
            est_seconds = elapsed * scale
            print(f"  Estimated total calls:  {est_calls:.0f}")
            print(f"  Estimated wall time:    {est_seconds/60:.1f} min")
            print(f"  Note: linear extrapolation; rate limiter cooldowns scale linearly,")
            print(f"        so this is a reasonable upper-bound estimate.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
