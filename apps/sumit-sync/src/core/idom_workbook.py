"""
IDOM Workbook Parser — Multi-sheet IDOM template handler.

Reads the structured "תבנית אידום" XLSX with multiple sheets
(עצמאים, חברות, מנהלים, הצהרות הון) and routes each sheet
to the appropriate report type for sync.

This is a NEW file — does NOT modify idom_parser.py.
Uses IDOMParser internally for per-sheet parsing.
"""

import pandas as pd
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from .idom_parser import IDOMParser
from .config import ReportType

logger = logging.getLogger(__name__)


# Sheet name → report type mapping
SHEET_REPORT_MAP: Dict[str, Optional[str]] = {
    'עצמאים': 'annual',
    'חברות': 'financial',
    'מנהלים': None,       # No Summit config yet — parsed but flagged
    'הצהרות הון': None,   # Future
}

# Template rows: row 1 = title, row 2 = instructions, row 3 = headers, row 4 = hints
TEMPLATE_HEADER_ROW = 2   # 0-indexed (row 3 in Excel)
TEMPLATE_SKIP_ROWS = [0, 1, 3]  # Skip title, instructions, hints


@dataclass
class SheetResult:
    """Result from parsing a single IDOM sheet."""
    sheet_name: str
    report_type: Optional[str]  # 'annual', 'financial', or None (unmapped)
    records: pd.DataFrame
    conflicts: pd.DataFrame
    warnings: List[str]
    error: Optional[str] = None


@dataclass
class WorkbookResult:
    """Result from parsing the entire IDOM workbook."""
    sheets: List[SheetResult]
    total_records: int
    total_conflicts: int
    unmapped_sheets: List[str]  # Sheets without a Summit target

    @property
    def mapped_sheets(self) -> List[SheetResult]:
        return [s for s in self.sheets if s.report_type is not None and s.error is None]

    @property
    def has_errors(self) -> bool:
        return any(s.error is not None for s in self.sheets)

    def summary(self) -> str:
        lines = [f"IDOM Workbook: {len(self.sheets)} sheets, {self.total_records} total records"]
        for s in self.sheets:
            status = f"✓ {len(s.records)} records" if s.error is None else f"✗ {s.error}"
            mapped = f" → {s.report_type}" if s.report_type else " (לא ממופה)"
            lines.append(f"  {s.sheet_name}{mapped}: {status}")
        if self.unmapped_sheets:
            lines.append(f"  Unmapped: {', '.join(self.unmapped_sheets)}")
        return "\n".join(lines)


def _is_template_format(filepath: str, sheet_name: str) -> bool:
    """
    Detect if a sheet uses the structured template format
    (title row, instructions row, headers in row 3, hints in row 4).

    Template signature: row 2 (0-indexed) contains known Hebrew header strings
    like 'מספר תיק', 'שם משפחה ופרטי', 'תאריך ארכה'.
    """
    try:
        df_raw = pd.read_excel(filepath, sheet_name=sheet_name, header=None, nrows=5)
        if len(df_raw) < 4:
            return False

        # Check if row 2 contains known IDOM header strings
        row2_values = [str(v).strip() for v in df_raw.iloc[2].tolist() if pd.notna(v)]
        known_headers = {'מספר תיק', 'שם משפחה ופרטי', 'תאריך ארכה', 'תאריך הגשה', 'פקיד שומה', 'קוד שידור'}
        matches = sum(1 for v in row2_values if v in known_headers)

        if matches >= 3:
            logger.info(f"  Sheet '{sheet_name}': detected template format ({matches} header matches)")
            return True
    except Exception as e:
        logger.debug(f"  Template detection error for '{sheet_name}': {e}")

    return False


# Positional column assignments for Guy's headerless freeform paste.
# Derived from actual IDOM 2025 file analysis.
# עצמאים: 8 cols [empty, empty, תאריך_ארכה, קוד_שידור, סוג_תיק, פקיד_שומה, שם, מספר_תיק]
# חברות/מנהלים: 7 cols [empty, תאריך_ארכה, קוד_שידור, סוג_תיק, פקיד_שומה, שם, מספר_תיק]
POSITIONAL_MAP_8COL = {
    2: 'תאריך_ארכה',
    3: 'קוד_שידור',
    4: 'סוג_תיק',
    5: 'פקיד_שומה',
    6: 'שם',
    7: 'מספר_תיק',
}

POSITIONAL_MAP_7COL = {
    1: 'תאריך_ארכה',
    2: 'קוד_שידור',
    3: 'סוג_תיק',
    4: 'פקיד_שומה',
    5: 'שם',
    6: 'מספר_תיק',
}


def _read_sheet(filepath: str, sheet_name: str) -> pd.DataFrame:
    """
    Read a single sheet, auto-detecting format (template vs freeform).
    Returns a DataFrame with proper column names.
    """
    if _is_template_format(filepath, sheet_name):
        # Template: headers at row 2 (0-indexed), data from row 4
        df_raw = pd.read_excel(filepath, sheet_name=sheet_name, header=None)
        headers = df_raw.iloc[2].tolist()  # Row 3 in Excel
        data = df_raw.iloc[4:]  # Row 5+ in Excel
        data.columns = headers
        data = data.reset_index(drop=True)
        data = data.dropna(how='all')
        logger.info(f"  Sheet '{sheet_name}': template format, {len(data)} data rows")
        return data
    else:
        # Freeform headerless paste — assign columns by position
        df_raw = pd.read_excel(filepath, sheet_name=sheet_name, header=None)

        # Drop fully empty rows (leading blank rows)
        df_raw = df_raw.dropna(how='all').reset_index(drop=True)

        ncols = df_raw.shape[1]
        if ncols == 8:
            pos_map = POSITIONAL_MAP_8COL
        elif ncols == 7:
            pos_map = POSITIONAL_MAP_7COL
        else:
            logger.warning(f"  Sheet '{sheet_name}': unexpected {ncols} columns, attempting pattern detection")
            # Fall back — return as-is, let IDOMParser pattern detection handle it
            return df_raw

        # Rename columns by position
        rename = {}
        for idx, name in pos_map.items():
            if idx < ncols:
                rename[idx] = name
        df_raw.columns = [rename.get(i, f'_unused_{i}') for i in range(ncols)]

        # Drop unused columns
        df_raw = df_raw[[c for c in df_raw.columns if not c.startswith('_unused_')]]

        logger.info(f"  Sheet '{sheet_name}': freeform {ncols}-col, {len(df_raw)} rows, positional mapping applied")
        return df_raw


def _parse_sheet(filepath: str, sheet_name: str) -> SheetResult:
    """Parse a single sheet using the existing IDOMParser."""
    report_type = SHEET_REPORT_MAP.get(sheet_name)

    try:
        df = _read_sheet(filepath, sheet_name)

        if df.empty or len(df) == 0:
            return SheetResult(
                sheet_name=sheet_name,
                report_type=report_type,
                records=pd.DataFrame(),
                conflicts=pd.DataFrame(),
                warnings=[f"Sheet '{sheet_name}' is empty"],
            )

        logger.info(f"  Sheet '{sheet_name}': {len(df)} rows, {len(df.columns)} cols")
        logger.debug(f"  Headers: {list(df.columns)}")

        parser = IDOMParser()

        # Check if columns are already named (from positional mapping or template)
        known_cols = {'מספר_תיק', 'תאריך_ארכה', 'תאריך_הגשה', 'שם', 'פקיד_שומה', 'סוג_תיק', 'קוד_שידור', 'מח', 'שנת_שומה'}
        has_named_cols = len(set(df.columns) & known_cols) >= 2

        if has_named_cols:
            # Columns already named — skip detection, just parse data
            logger.info(f"  Columns pre-mapped: {[c for c in df.columns if c in known_cols]}")
            df = parser._parse_data(df)
        else:
            # Unknown headers — use IDOMParser's detection pipeline
            parser._detect_columns(df)
            df = parser._rename_columns(df)
            df = parser._parse_data(df)

        # Remove rows without match key
        initial = len(df)
        df = df[df['מספר_תיק'].notna() & (df['מספר_תיק'] != '')]
        removed = initial - len(df)
        if removed > 0:
            parser.parse_warnings.append(f"Removed {removed} rows without מספר_תיק")

        # Deduplicate
        dedup_df, conflict_df = parser.deduplicate(df)

        return SheetResult(
            sheet_name=sheet_name,
            report_type=report_type,
            records=dedup_df,
            conflicts=conflict_df,
            warnings=parser.parse_warnings,
        )

    except Exception as e:
        logger.error(f"  Sheet '{sheet_name}' parse error: {e}")
        return SheetResult(
            sheet_name=sheet_name,
            report_type=report_type,
            records=pd.DataFrame(),
            conflicts=pd.DataFrame(),
            warnings=[],
            error=str(e),
        )


def parse_idom_workbook(filepath: str) -> WorkbookResult:
    """
    Parse a multi-sheet IDOM workbook.

    Reads all sheets, detects format (template vs freeform), parses each
    with the existing IDOMParser, and routes to report types.

    Args:
        filepath: Path to the IDOM XLSX file

    Returns:
        WorkbookResult with per-sheet results and summary
    """
    logger.info(f"Opening IDOM workbook: {filepath}")

    # Get sheet names
    try:
        xl = pd.ExcelFile(filepath)
        sheet_names = xl.sheet_names
        logger.info(f"Found {len(sheet_names)} sheets: {sheet_names}")
    except Exception as e:
        raise ValueError(f"Failed to open workbook: {e}")

    # Filter to data sheets (skip הוראות and any unknown sheets)
    data_sheets = [s for s in sheet_names if s in SHEET_REPORT_MAP or s not in ['הוראות', 'Sheet1']]

    results = []
    total_records = 0
    total_conflicts = 0
    unmapped = []

    for sheet_name in data_sheets:
        logger.info(f"Parsing sheet: {sheet_name}")
        result = _parse_sheet(filepath, sheet_name)
        results.append(result)

        if result.error is None:
            total_records += len(result.records)
            total_conflicts += len(result.conflicts)

        if result.report_type is None and result.error is None and len(result.records) > 0:
            unmapped.append(sheet_name)

    workbook_result = WorkbookResult(
        sheets=results,
        total_records=total_records,
        total_conflicts=total_conflicts,
        unmapped_sheets=unmapped,
    )

    logger.info(workbook_result.summary())
    return workbook_result
