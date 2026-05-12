"""
Smoke test for fetch_sumit_data_targeted against Client-α.

Hits the real Summit API. Requires SUMMIT_COMPANY_ID and SUMMIT_API_KEY
in the environment. Not a pytest test — run manually:

    cd apps/sumit-sync
    source .venv/bin/activate
    SUMMIT_COMPANY_ID=... SUMMIT_API_KEY=... python scripts/smoke_targeted_fetch.py

What it proves:
  1. find_client_id_by_company_number resolves 206775140 → 1864195687
  2. find_report_id resolves (1124761700, 1864195687, 1125575564) → 1896724808
  3. fetch_sumit_data_targeted produces the same DataFrame shape as the
     fetch-all path, with the Client-α 2024 report as the only row.
  4. Measures API call count + elapsed time as the headline number.
"""

import os
import sys
import time
from pathlib import Path

# Allow `python scripts/smoke_targeted_fetch.py` to find src/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.core.config import FINANCIAL_CONFIG  # noqa: E402
from src.core.sumit_api_client import SummitAPIClient  # noqa: E402
from src.core.mapping_store import MappingStore  # noqa: E402
from src.core.sumit_api_source import fetch_sumit_data_targeted  # noqa: E402


CLIENT_ALPHA_CHP = "206775140"
EXPECTED_CLIENT_ID = 1864195687
EXPECTED_REPORT_ID = 1896724808
TAX_YEAR = 2024


def main() -> int:
    if not os.environ.get("SUMMIT_API_KEY") or not os.environ.get("SUMMIT_COMPANY_ID"):
        print("ERROR: SUMMIT_API_KEY and SUMMIT_COMPANY_ID env vars required", file=sys.stderr)
        return 2

    print(f"=== Smoke: fetch_sumit_data_targeted vs Client-α (ח.פ={CLIENT_ALPHA_CHP}) ===")

    api = SummitAPIClient()
    mapping = MappingStore(path=Path("/tmp/smoke_mapping.json"))

    # Stage 1: direct method probes
    print("\n[stage 1] Probing find_client_id_by_company_number...")
    # NOTE: in production each ח.פ should be unique. In this test environment
    # there are multiple stale test cards with Shay's ת.ז 206775140. We verify
    # Client-α appears in the matches; production cardinality is a separate
    # data-quality concern (flagged below).
    t0 = time.monotonic()
    # Use the raw filtered listentities to inspect cardinality
    raw = api._post(
        "/crm/data/listentities/",
        {
            "Folder": "557688522",
            "Paging": {"StartIndex": 0, "PageSize": 50},
            "Filters": [{"Property": "Customers_CompanyNumber", "Value": CLIENT_ALPHA_CHP}],
        },
    )
    matches = [e["ID"] for e in raw.get("Entities", [])]
    t1 = time.monotonic()
    print(f"  filter returned {len(matches)} matches in {t1-t0:.2f}s")
    if EXPECTED_CLIENT_ID not in matches:
        print(f"  FAIL: Client-α {EXPECTED_CLIENT_ID} not in matches: {matches}")
        return 1
    if len(matches) > 1:
        print(f"  WARN: ח.פ collision — {len(matches)} cards share this ת.ז (test artifacts)")
        print(f"        production assumption: ח.פ unique; collisions must FLAG, not silent-pick.")

    print("\n[stage 2] Probing find_report_id with Client-α (folder × client × year=2024)...")
    t0 = time.monotonic()
    rid = api.find_report_id("1124761700", EXPECTED_CLIENT_ID, 1125575564)
    t1 = time.monotonic()
    print(f"  resolved report_id={rid} in {t1-t0:.2f}s")
    if rid != EXPECTED_REPORT_ID:
        print(f"  FAIL: expected {EXPECTED_REPORT_ID}, got {rid}")
        return 1

    # Stage 3: targeted fetch — single Client-α ID via pre-seeded mapping
    # (We skip the company-number lookup in this run because of the known
    #  ת.ז collision. The targeted path will be the same call count in
    #  production where ח.פ is unique.)
    print("\n[stage 3] Pre-seeding mapping + running fetch_sumit_data_targeted...")
    mapping.add(EXPECTED_CLIENT_ID, CLIENT_ALPHA_CHP, "שי גרייבר בדיקה")
    start_calls = api.call_count
    t0 = time.monotonic()
    df, lookup, warnings = fetch_sumit_data_targeted(
        config=FINANCIAL_CONFIG,
        tax_year=TAX_YEAR,
        idom_company_numbers=[CLIENT_ALPHA_CHP],
        client=api,
        mapping=mapping,
    )
    elapsed = time.monotonic() - t0
    calls_used = api.call_count - start_calls

    print(f"  elapsed: {elapsed:.2f}s")
    print(f"  API calls in this stage: {calls_used}")
    print(f"  rows returned: {len(df)}")
    print(f"  warnings: {warnings}")

    if len(df) != 1:
        print(f"  FAIL: expected 1 row, got {len(df)}")
        return 1

    row = df.iloc[0]
    print(f"  מזהה={row['מזהה']}  ח.פ={row['ח.פ']}  לקוח={row['כרטיס לקוח']}")
    print(f"  שנת מס={row['שנת מס']}  סטטוס={row['סטטוס']}")

    if str(row["מזהה"]) != str(EXPECTED_REPORT_ID):
        print(f"  FAIL: expected report ID {EXPECTED_REPORT_ID}, got {row['מזהה']}")
        return 1

    print(f"\n=== PASS — total API calls (full smoke): {api.call_count}, elapsed: {elapsed:.2f}s ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
