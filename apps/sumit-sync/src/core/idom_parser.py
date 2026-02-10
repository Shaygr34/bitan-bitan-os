"""
IDOM→SUMIT Sync Engine - IDOM Parser
Robust parsing of SHAAM/IDOM paste data with column shift detection.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import re
import logging

from .config import IDOMSchema

logger = logging.getLogger(__name__)


class IDOMParseError(Exception):
    """Error during IDOM parsing."""
    pass


class IDOMParser:
    """
    Parser for SHAAM/IDOM paste data.
    Handles column shift issues and normalizes data.
    """
    
    def __init__(self):
        self.schema = IDOMSchema()
        self.column_mapping: Dict[str, int] = {}
        self.parse_warnings: List[str] = []
        self.parse_errors: List[str] = []
    
    def parse(self, filepath: str) -> pd.DataFrame:
        """
        Parse IDOM Excel file with robust column detection.
        
        Args:
            filepath: Path to IDOM paste Excel file
            
        Returns:
            Normalized DataFrame with standardized column names
        """
        logger.info(f"Parsing IDOM file: {filepath}")
        
        # Read Excel file
        try:
            df = pd.read_excel(filepath, header=0)
        except Exception as e:
            raise IDOMParseError(f"Failed to read Excel file: {e}")
        
        logger.info(f"Read {len(df)} rows, {len(df.columns)} columns")
        logger.debug(f"Original columns: {list(df.columns)}")
        
        # Detect and map columns
        self._detect_columns(df)
        
        # Rename columns to standard names
        df = self._rename_columns(df)
        
        # Parse and validate data
        df = self._parse_data(df)
        
        # Remove rows without match key
        initial_count = len(df)
        df = df[df['מספר_תיק'].notna() & (df['מספר_תיק'] != '')]
        removed = initial_count - len(df)
        if removed > 0:
            logger.info(f"Removed {removed} rows without מספר_תיק")
        
        logger.info(f"Parsed {len(df)} valid IDOM records")
        return df
    
    def _detect_columns(self, df: pd.DataFrame) -> None:
        """
        Detect column positions by header matching.
        Handles the known 'מח empty → column shift' issue.
        """
        original_columns = list(df.columns)
        self.column_mapping = {}
        
        # First pass: exact or substring match on headers
        for std_name, possible_headers in self.schema.HEADERS.items():
            found = False
            for idx, col in enumerate(original_columns):
                col_str = str(col).strip()
                for header in possible_headers:
                    # Use more precise matching
                    if col_str == header or header == col_str:
                        self.column_mapping[std_name] = idx
                        found = True
                        logger.debug(f"Mapped {std_name} → column {idx} ('{col}')")
                        break
                if found:
                    break
            
            # If not found with exact match, try contains
            if not found:
                for idx, col in enumerate(original_columns):
                    # Skip already mapped columns
                    if idx in self.column_mapping.values():
                        continue
                    col_str = str(col).strip()
                    for header in possible_headers:
                        if header in col_str:
                            self.column_mapping[std_name] = idx
                            found = True
                            logger.debug(f"Mapped {std_name} → column {idx} ('{col}') [contains]")
                            break
                    if found:
                        break
        
        # Special handling for problematic columns if still not found
        for std_name, possible_headers in self.schema.HEADERS.items():
            if std_name in self.column_mapping:
                continue
                
            if std_name == 'מספר_תיק':
                # מספר תיק is typically 9-digit numbers
                idx = self._detect_by_pattern(df, r'^\d{6,9}$')
                if idx is not None:
                    self.column_mapping[std_name] = idx
                    self.parse_warnings.append(f"Detected מספר_תיק by pattern in column {idx}")
            
            elif std_name == 'שם':
                # Name column contains Hebrew text with multiple words
                idx = self._detect_by_pattern(df, r'[\u0590-\u05FF]{2,}\s+[\u0590-\u05FF]{2,}')
                if idx is not None and idx not in self.column_mapping.values():
                    self.column_mapping[std_name] = idx
                    self.parse_warnings.append(f"Detected שם by pattern in column {idx}")
        
        # Validate required columns
        for req_field in self.schema.REQUIRED_FIELDS:
            if req_field not in self.column_mapping:
                raise IDOMParseError(f"Required column not found: {req_field}")
        
        logger.info(f"Column mapping: {self.column_mapping}")
        if self.parse_warnings:
            for w in self.parse_warnings:
                logger.warning(w)
    
    def _detect_by_pattern(self, df: pd.DataFrame, pattern: str) -> Optional[int]:
        """Detect column by regex pattern matching on data values."""
        regex = re.compile(pattern)
        for idx in range(len(df.columns)):
            # Check first 10 non-null values
            sample = df.iloc[:10, idx].dropna().astype(str)
            matches = sum(1 for v in sample if regex.search(v))
            if matches >= 3:  # At least 3 matches
                return idx
        return None
    
    def _rename_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Rename columns to standard names based on mapping."""
        new_df = pd.DataFrame()
        
        for std_name, idx in self.column_mapping.items():
            new_df[std_name] = df.iloc[:, idx]
        
        return new_df
    
    def _parse_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Parse and clean data values."""
        
        # Parse dates
        for date_col in ['תאריך_ארכה', 'תאריך_הגשה']:
            if date_col in df.columns:
                df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        
        # Normalize מספר_תיק - digits only, preserve leading zeros
        if 'מספר_תיק' in df.columns:
            df['מספר_תיק'] = df['מספר_תיק'].apply(self._normalize_key)
        
        # Clean string fields
        for str_col in ['שם', 'קוד_שידור']:
            if str_col in df.columns:
                df[str_col] = df[str_col].astype(str).str.strip()
                df[str_col] = df[str_col].replace('nan', '')
        
        return df
    
    @staticmethod
    def _normalize_key(value) -> str:
        """
        Normalize match key: extract digits only, preserve leading zeros.
        """
        if pd.isna(value):
            return ''
        
        # Convert to string
        val_str = str(value)
        
        # Handle float formatting (e.g., 123456.0)
        if '.' in val_str:
            try:
                val_str = str(int(float(val_str)))
            except (ValueError, OverflowError):
                pass
        
        # Extract digits only
        digits = re.sub(r'[^\d]', '', val_str)
        
        return digits
    
    def deduplicate(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Deduplicate IDOM records by מספר_תיק.
        
        Rules:
        1. Choose record with latest תאריך_הגשה
        2. If no submission → latest תאריך_ארכה
        3. Conflicts → report as exceptions
        
        Returns:
            Tuple of (deduplicated_df, conflict_df)
        """
        if df.empty:
            return df, pd.DataFrame()
        
        # Group by מספר_תיק
        groups = df.groupby('מספר_תיק')
        
        unique_records = []
        conflict_records = []
        
        for key, group in groups:
            if len(group) == 1:
                unique_records.append(group.iloc[0])
                continue
            
            # Multiple records - need to choose
            logger.debug(f"Duplicate מספר_תיק: {key} ({len(group)} records)")
            
            # Sort by תאריך_הגשה (descending, nulls last)
            has_submission = group[group['תאריך_הגשה'].notna()]
            
            if len(has_submission) > 0:
                # Choose latest submission
                best = has_submission.sort_values('תאריך_הגשה', ascending=False).iloc[0]
                unique_records.append(best)
            else:
                # No submissions - choose latest extension
                sorted_group = group.sort_values('תאריך_ארכה', ascending=False, na_position='last')
                best = sorted_group.iloc[0]
                unique_records.append(best)
            
            # Report all duplicates as potential conflicts
            for _, row in group.iterrows():
                conflict_row = row.copy()
                conflict_row['_conflict_reason'] = 'duplicate_מספר_תיק'
                conflict_records.append(conflict_row)
        
        dedup_df = pd.DataFrame(unique_records)
        conflict_df = pd.DataFrame(conflict_records) if conflict_records else pd.DataFrame()
        
        logger.info(f"Deduplication: {len(df)} → {len(dedup_df)} records, {len(conflict_df)} conflicts")
        
        return dedup_df, conflict_df


def parse_idom_file(filepath: str) -> Tuple[pd.DataFrame, pd.DataFrame, List[str]]:
    """
    Convenience function to parse IDOM file.
    
    Returns:
        Tuple of (parsed_df, conflicts_df, warnings)
    """
    parser = IDOMParser()
    df = parser.parse(filepath)
    dedup_df, conflict_df = parser.deduplicate(df)
    return dedup_df, conflict_df, parser.parse_warnings
