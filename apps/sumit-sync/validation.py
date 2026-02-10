"""
IDOM→SUMIT Sync Engine - Preflight Validation
Validates input files before running sync.
"""

import pandas as pd
import re
from typing import List, Tuple, Optional
from dataclasses import dataclass, field
from datetime import datetime

from .config import ReportConfig, IDOMSchema


@dataclass
class ValidationResult:
    """Result of preflight validation."""
    is_valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    info: List[str] = field(default_factory=list)
    
    # Stats
    idom_row_count: int = 0
    sumit_row_count: int = 0
    sumit_year_count: int = 0
    
    def add_error(self, msg: str):
        self.errors.append(msg)
        self.is_valid = False
    
    def add_warning(self, msg: str):
        self.warnings.append(msg)
    
    def add_info(self, msg: str):
        self.info.append(msg)


def validate_idom_file(df: pd.DataFrame, config: ReportConfig) -> ValidationResult:
    """
    Validate IDOM paste file.
    
    Checks:
    - Has data rows
    - Has recognizable headers
    - Has required columns (מספר תיק, תאריך ארכה)
    """
    result = ValidationResult()
    schema = IDOMSchema()
    
    if df.empty:
        result.add_error("קובץ IDOM ריק - אין נתונים")
        return result
    
    result.idom_row_count = len(df)
    result.add_info(f"נמצאו {len(df)} שורות בקובץ IDOM")
    
    # Check for required columns by header detection
    columns = list(df.columns)
    found_columns = {}
    
    for std_name, possible_headers in schema.HEADERS.items():
        for idx, col in enumerate(columns):
            col_str = str(col).strip()
            for header in possible_headers:
                if col_str == header or header in col_str:
                    found_columns[std_name] = col
                    break
    
    # Check required fields
    for req_field in schema.REQUIRED_FIELDS:
        if req_field not in found_columns:
            result.add_error(f"עמודה חסרה בקובץ IDOM: {req_field}")
    
    # Check for מספר תיק specifically
    if 'מספר_תיק' not in found_columns:
        result.add_error("לא נמצאה עמודת 'מספר תיק' - נדרשת להתאמה")
    
    # Check for dates
    if 'תאריך_ארכה' not in found_columns:
        result.add_error("לא נמצאה עמודת 'תאריך ארכה'")
    
    if result.is_valid:
        result.add_info(f"זוהו עמודות: {', '.join(found_columns.keys())}")
    
    return result


def validate_sumit_file(df: pd.DataFrame, config: ReportConfig, tax_year: int) -> ValidationResult:
    """
    Validate SUMIT export file.
    
    Checks:
    - Has required headers per schema
    - Has data for requested tax year
    - Not obviously filtered/incomplete
    - Date format validation
    """
    result = ValidationResult()
    
    if df.empty:
        result.add_error("קובץ SUMIT ריק - אין נתונים")
        return result
    
    result.sumit_row_count = len(df)
    
    # Check required headers
    columns = list(df.columns)
    missing_headers = []
    
    for required in config.export_schema.required_headers:
        if required not in columns:
            # Try partial match
            found = False
            for col in columns:
                if required in col or col in required:
                    found = True
                    break
            if not found:
                missing_headers.append(required)
    
    if missing_headers:
        result.add_error(f"עמודות חסרות בייצוא SUMIT: {', '.join(missing_headers)}")
    
    # Check match key column exists
    match_key = config.export_schema.match_key_header
    if match_key not in columns:
        result.add_error(f"עמודת מפתח חסרה: {match_key}")
    
    # Check for tax year
    year_col = 'שנת מס'
    if year_col in columns:
        def extract_year(val):
            if pd.isna(val):
                return None
            val_str = str(val)
            if ':' in val_str:
                year_part = val_str.split(':')[-1].strip()
                match = re.search(r'(\d{4})', year_part)
                if match:
                    return int(match.group(1))
            match = re.search(r'\b(20\d{2})\b', val_str)
            if match:
                return int(match.group(1))
            return None
        
        years = df[year_col].apply(extract_year)
        year_counts = years.value_counts()
        
        if tax_year in year_counts.index:
            result.sumit_year_count = year_counts[tax_year]
            result.add_info(f"נמצאו {result.sumit_year_count} רשומות לשנת {tax_year}")
        else:
            result.add_error(f"לא נמצאו רשומות לשנת המס {tax_year}")
            if len(year_counts) > 0:
                available_years = sorted(year_counts.index.dropna().astype(int).tolist())
                result.add_info(f"שנים זמינות בקובץ: {available_years}")
    
    # Check for filtered/incomplete export
    if result.sumit_year_count > 0 and result.sumit_year_count < config.min_expected_sumit_records:
        result.add_warning(
            f"⚠️ נמצאו רק {result.sumit_year_count} רשומות - ייתכן שהייצוא מסונן. "
            f"צפי מינימלי: {config.min_expected_sumit_records}"
        )
    
    # Validate date format in date columns
    date_columns = ['תחילת עבודה', 'סיום עבודה מקדימה', 'הגשה', 'אורכה מ"ה', 'אורכה משרד']
    for date_col in date_columns:
        if date_col in columns:
            sample = df[date_col].dropna().head(5)
            for val in sample:
                if isinstance(val, str):
                    # Check if it's in wrong format
                    if re.match(r'^\d{4}-\d{2}-\d{2}', val):
                        result.add_warning(f"פורמט תאריך לא תקין בעמודה {date_col}: צפוי dd/MM/yyyy")
                        break
    
    if result.is_valid and not result.warnings:
        result.add_info("✓ קובץ SUMIT תקין")
    
    return result


def validate_match_keys(idom_df: pd.DataFrame, sumit_df: pd.DataFrame, 
                        config: ReportConfig) -> ValidationResult:
    """
    Validate that match keys can be reconciled.
    
    Checks:
    - Key format compatibility
    - Leading zeros handling
    - Expected match rate
    """
    result = ValidationResult()
    
    # Extract keys
    idom_key_col = 'מספר תיק'
    sumit_key_col = config.export_schema.match_key_header
    
    # Find IDOM key column
    idom_keys = set()
    for col in idom_df.columns:
        if 'מספר תיק' in str(col) or 'תיק' in str(col):
            for val in idom_df[col].dropna():
                key = str(int(float(val))) if pd.notna(val) else ''
                if key:
                    idom_keys.add(key)
            break
    
    # Find SUMIT keys
    sumit_keys = set()
    sumit_keys_normalized = set()
    
    if sumit_key_col in sumit_df.columns:
        for val in sumit_df[sumit_key_col].dropna():
            key = re.sub(r'[^\d]', '', str(val))
            if key:
                sumit_keys.add(key)
                sumit_keys_normalized.add(key.lstrip('0'))
    
    if not idom_keys:
        result.add_error("לא נמצאו מפתחות בקובץ IDOM")
        return result
    
    if not sumit_keys:
        result.add_error("לא נמצאו מפתחות בקובץ SUMIT")
        return result
    
    # Check matches
    direct_matches = idom_keys & sumit_keys
    normalized_matches = set()
    
    for idom_key in idom_keys:
        normalized = idom_key.lstrip('0')
        if normalized in sumit_keys_normalized:
            normalized_matches.add(idom_key)
    
    total_matches = len(direct_matches | normalized_matches)
    match_rate = total_matches / len(idom_keys) * 100 if idom_keys else 0
    
    result.add_info(f"מפתחות IDOM: {len(idom_keys)}, מפתחות SUMIT: {len(sumit_keys)}")
    result.add_info(f"התאמות צפויות: {total_matches} ({match_rate:.1f}%)")
    
    if match_rate < 50:
        result.add_warning(
            f"⚠️ שיעור התאמה צפוי נמוך ({match_rate:.1f}%). "
            "בדוק שהקבצים מתאימים לאותו סוג דוח ושנת מס."
        )
    
    unmatched = len(idom_keys) - total_matches
    if unmatched > 0:
        result.add_info(f"רשומות ללא התאמה צפויות: {unmatched}")
    
    return result


def run_preflight_validation(
    idom_df: pd.DataFrame,
    sumit_df: pd.DataFrame,
    config: ReportConfig,
    tax_year: int
) -> ValidationResult:
    """
    Run all preflight validations.
    
    Returns combined ValidationResult.
    """
    combined = ValidationResult()
    
    # Validate IDOM
    idom_result = validate_idom_file(idom_df, config)
    combined.errors.extend(idom_result.errors)
    combined.warnings.extend(idom_result.warnings)
    combined.info.extend(idom_result.info)
    combined.idom_row_count = idom_result.idom_row_count
    
    # Validate SUMIT
    sumit_result = validate_sumit_file(sumit_df, config, tax_year)
    combined.errors.extend(sumit_result.errors)
    combined.warnings.extend(sumit_result.warnings)
    combined.info.extend(sumit_result.info)
    combined.sumit_row_count = sumit_result.sumit_row_count
    combined.sumit_year_count = sumit_result.sumit_year_count
    
    # Validate match keys (only if both files are valid so far)
    if not combined.errors:
        match_result = validate_match_keys(idom_df, sumit_df, config)
        combined.errors.extend(match_result.errors)
        combined.warnings.extend(match_result.warnings)
        combined.info.extend(match_result.info)
    
    combined.is_valid = len(combined.errors) == 0
    
    return combined
