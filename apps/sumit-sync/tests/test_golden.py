"""
Golden regression test for the reconciliation pipeline.

Given synthetic IDOM + SUMIT inputs with known data, asserts:
1. SyncResult metrics match expected counts exactly
2. Import DataFrame content matches expected values
3. Exceptions are correctly identified
4. Output files are generated and structurally valid

Normalization: OutputWriter embeds timestamps (YYYYMMDD_HHMMSS) in filenames
and a "Generated:" line in the diff report. We assert on content, not filenames.
Column ordering is deterministic (defined by config schemas).
Date formatting is deterministic (dd/MM/yyyy via OutputWriter._clean_value).
"""

from pathlib import Path

import pandas as pd

from src.core.config import get_config, STATUS_COMPLETED
from src.core.idom_parser import parse_idom_file
from src.core.sumit_parser import parse_sumit_file
from src.core.sync_engine import run_sync
from src.core.output_writer import write_outputs


def test_golden_sync_metrics(golden_idom_file, golden_sumit_file):
    """Verify SyncResult aggregate counts match expected values."""
    config = get_config("financial")

    idom_df, conflicts, idom_warnings = parse_idom_file(str(golden_idom_file))
    sumit_df, lookup, sumit_warnings = parse_sumit_file(str(golden_sumit_file), config, 2024)

    result = run_sync(idom_df, sumit_df, lookup, config, 2024)

    # 5 IDOM rows → 4 after dedup (row 4 is dup of row 0)
    assert result.total_idom_records == 4, f"Expected 4 IDOM records after dedup, got {result.total_idom_records}"

    assert result.total_sumit_records == 4, f"Expected 4 SUMIT records, got {result.total_sumit_records}"

    # 3 matched (123456789, 987654321, 111111111), 1 unmatched (555555555)
    assert result.matched_count == 3, f"Expected 3 matched, got {result.matched_count}"
    assert result.unmatched_count == 1, f"Expected 1 unmatched, got {result.unmatched_count}"

    # 123456789 has submission → status completed
    assert result.status_completed_count == 1, f"Expected 1 completed, got {result.status_completed_count}"

    # 111111111 is completed in SUMIT but no submission in IDOM → regression
    assert result.status_regression_flags == 1, f"Expected 1 regression flag, got {result.status_regression_flags}"


def test_golden_import_content(golden_idom_file, golden_sumit_file):
    """Verify the import DataFrame has correct values for matched records."""
    config = get_config("financial")

    idom_df, _, _ = parse_idom_file(str(golden_idom_file))
    sumit_df, lookup, _ = parse_sumit_file(str(golden_sumit_file), config, 2024)
    result = run_sync(idom_df, sumit_df, lookup, config, 2024)

    import_df = result.import_df
    assert len(import_df) == 3, f"Expected 3 import rows, got {len(import_df)}"

    # Columns must match Financial import schema exactly
    expected_cols = config.import_schema.columns
    assert list(import_df.columns) == expected_cols

    # Find row for 123456789 (has submission → completed)
    row_123 = import_df[import_df["מזהה"] == "1001"]
    assert len(row_123) == 1
    status_val = str(row_123.iloc[0]["סטטוס"])
    assert STATUS_COMPLETED in status_val, f"Expected completed status, got {status_val}"


def test_golden_exceptions(golden_idom_file, golden_sumit_file):
    """Verify unmatched IDOM records appear as exceptions."""
    config = get_config("financial")

    idom_df, _, _ = parse_idom_file(str(golden_idom_file))
    sumit_df, lookup, _ = parse_sumit_file(str(golden_sumit_file), config, 2024)
    result = run_sync(idom_df, sumit_df, lookup, config, 2024)

    exc_df = result.exceptions_df
    assert len(exc_df) == 1, f"Expected 1 exception, got {len(exc_df)}"

    exc_row = exc_df.iloc[0]
    assert exc_row["exception_type"] == "no_sumit_match"
    assert str(exc_row["מספר_תיק"]) == "555555555"


def test_golden_dedup(golden_idom_file):
    """Verify IDOM deduplication picks the record with latest extension."""
    idom_df, conflicts, _ = parse_idom_file(str(golden_idom_file))

    # 5 input rows → 4 unique מספר_תיק values
    assert len(idom_df) == 4, f"Expected 4 after dedup, got {len(idom_df)}"

    # The kept record for 123456789 should have the later extension (2024-06-30)
    # because it also has a submission date (2024-05-15)
    row = idom_df[idom_df["מספר_תיק"] == "123456789"]
    assert len(row) == 1
    ext_date = row.iloc[0]["תאריך_ארכה"]
    assert ext_date.month == 6, f"Expected June extension, got month {ext_date.month}"


def test_golden_output_files(golden_idom_file, golden_sumit_file, tmp_path):
    """Verify output files are generated and contain expected sheets."""
    config = get_config("financial")

    idom_df, _, _ = parse_idom_file(str(golden_idom_file))
    sumit_df, lookup, _ = parse_sumit_file(str(golden_sumit_file), config, 2024)
    result = run_sync(idom_df, sumit_df, lookup, config, 2024)

    output_dir = str(tmp_path / "outputs")
    paths = write_outputs(result, config, output_dir, 2024)

    # All three output files generated
    assert "import" in paths
    assert "diff" in paths
    assert "exceptions" in paths

    for key, path_str in paths.items():
        p = Path(path_str)
        assert p.exists(), f"Output file missing: {path_str}"
        assert p.stat().st_size > 0, f"Output file empty: {path_str}"

    # Verify import file can be read back and has correct row count
    import_df = pd.read_excel(paths["import"])
    assert len(import_df) == 3

    # Verify diff report has expected sheets (Hebrew names per output_writer)
    diff_xl = pd.ExcelFile(paths["diff"])
    assert "סיכום" in diff_xl.sheet_names
    assert "שינויים" in diff_xl.sheet_names

    # Verify exceptions report has expected sheets (Hebrew names per output_writer)
    exc_xl = pd.ExcelFile(paths["exceptions"])
    assert "ללא התאמה" in exc_xl.sheet_names
