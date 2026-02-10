"""
IDOM→SUMIT Sync Engine - SUMIT Parser
Parsing of SUMIT export files with ID:Label format handling.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import re
import logging

from .config import ReportConfig, STATUS_COMPLETED, STATUS_COMPLETED_LABEL

logger = logging.getLogger(__name__)


class SUMITParseError(Exception):
    """Error during SUMIT parsing."""
    pass


class SUMITParser:
    """
    Parser for SUMIT export files.
    Handles ID:Label format and builds lookup index.
    """
    
    def __init__(self, config: ReportConfig):
        self.config = config
        self.parse_warnings: List[str] = []
        self.parse_errors: List[str] = []
    
    def parse(self, filepath: str, tax_year: int) -> pd.DataFrame:
        """
        Parse SUMIT export Excel file.
        
        Args:
            filepath: Path to SUMIT export Excel file
            tax_year: Tax year to filter (e.g., 2024)
            
        Returns:
            DataFrame with SUMIT data, indexed for matching
        """
        logger.info(f"Parsing SUMIT file: {filepath}")
        
        # Read Excel file
        try:
            df = pd.read_excel(filepath, header=0)
        except Exception as e:
            raise SUMITParseError(f"Failed to read Excel file: {e}")
        
        logger.info(f"Read {len(df)} rows, {len(df.columns)} columns")
        logger.debug(f"Columns: {list(df.columns)}")
        
        # Validate expected columns
        self._validate_columns(df)
        
        # Filter by tax year
        df = self._filter_by_year(df, tax_year)
        
        # Parse key fields
        df = self._parse_data(df)
        
        # Build match key column (normalized)
        match_key_header = self.config.export_schema.match_key_header
        df['_match_key'] = df[match_key_header].apply(self._normalize_key)
        df['_match_key_raw'] = df[match_key_header].apply(lambda x: str(x) if pd.notna(x) else '')
        
        # Check for duplicates
        self._check_duplicates(df)
        
        logger.info(f"Parsed {len(df)} SUMIT records for tax year {tax_year}")
        return df
    
    def _validate_columns(self, df: pd.DataFrame) -> None:
        """Validate that required columns exist."""
        required = [
            self.config.export_schema.match_key_header,
            'מזהה',
            'שנת מס',
        ]
        
        missing = [col for col in required if col not in df.columns]
        if missing:
            raise SUMITParseError(f"Missing required columns: {missing}")
    
    def _filter_by_year(self, df: pd.DataFrame, tax_year: int) -> pd.DataFrame:
        """Filter records to specified tax year."""
        year_col = 'שנת מס'
        
        if year_col not in df.columns:
            self.parse_warnings.append("No year column found, returning all records")
            return df
        
        initial_count = len(df)
        
        # Year column is in ID:Label format like "1125575564: 2024"
        def extract_year(value):
            if pd.isna(value):
                return None
            val_str = str(value)
            
            # If colon present, take the part after colon
            if ':' in val_str:
                year_part = val_str.split(':')[-1].strip()
                match = re.search(r'(\d{4})', year_part)
                if match:
                    return int(match.group(1))
            
            # Fallback: look for 4-digit year between 2000-2099
            match = re.search(r'\b(20\d{2})\b', val_str)
            if match:
                return int(match.group(1))
            
            return None
        
        df['_extracted_year'] = df[year_col].apply(extract_year)
        
        # Filter
        filtered = df[df['_extracted_year'] == tax_year].copy()
        filtered = filtered.drop(columns=['_extracted_year'])
        
        removed = initial_count - len(filtered)
        if removed > 0:
            logger.info(f"Filtered out {removed} records (not tax year {tax_year})")
        
        if len(filtered) == 0:
            self.parse_warnings.append(f"No records found for tax year {tax_year}")
        
        return filtered
    
    def _parse_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Parse and clean data values."""
        
        # Parse date columns
        date_columns = ['תחילת עבודה', 'סיום עבודה מקדימה', 'הגשה', 'אורכה מ"ה', 'אורכה משרד']
        for col in date_columns:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors='coerce')
        
        # Ensure מזהה is string
        if 'מזהה' in df.columns:
            df['מזהה'] = df['מזהה'].apply(self._clean_id)
        
        return df
    
    @staticmethod
    def _clean_id(value) -> str:
        """Clean SUMIT ID value."""
        if pd.isna(value):
            return ''
        val_str = str(value)
        # Remove .0 suffix from float conversion
        if val_str.endswith('.0'):
            val_str = val_str[:-2]
        return val_str
    
    @staticmethod
    def _normalize_key(value) -> str:
        """
        Normalize match key: extract digits only, preserve leading zeros.
        """
        if pd.isna(value):
            return ''
        
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
    
    def _check_duplicates(self, df: pd.DataFrame) -> None:
        """Check for and warn about duplicate match keys."""
        if df.empty:
            return
        
        dup_counts = df['_match_key'].value_counts()
        duplicates = dup_counts[dup_counts > 1]
        
        if len(duplicates) > 0:
            self.parse_warnings.append(
                f"Found {len(duplicates)} duplicate match keys in SUMIT export. "
                "First occurrence will be used for matching."
            )
            for key, count in duplicates.head(5).items():
                logger.warning(f"Duplicate match key: {key} ({count} occurrences)")
    
    def build_lookup(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """
        Build lookup dictionary from match key to record.
        Creates both exact and normalized (no leading zeros) lookups.
        
        Args:
            df: Parsed SUMIT DataFrame
            
        Returns:
            Dictionary mapping match_key → row data
        """
        lookup = {}
        
        for _, row in df.iterrows():
            key = row['_match_key']
            if key and key not in lookup:  # First occurrence wins
                lookup[key] = row
                
                # Also add normalized version (stripped leading zeros) for fallback matching
                normalized = key.lstrip('0')
                if normalized and normalized != key and normalized not in lookup:
                    lookup[normalized] = row
        
        logger.info(f"Built lookup with {len(lookup)} keys (including normalized variants)")
        return lookup
    
    def get_status_value(self, row: pd.Series) -> Tuple[str, bool]:
        """
        Get status value and whether it's "completed".
        
        Returns:
            Tuple of (status_value, is_completed)
        """
        status_col = self.config.export_schema.status_column
        # Find the actual column name by position hint or search
        status_header = 'סטטוס'
        
        if status_header not in row.index:
            return '', False
        
        status_val = row[status_header]
        if pd.isna(status_val):
            return '', False
        
        status_str = str(status_val)
        is_completed = STATUS_COMPLETED in status_str
        
        return status_str, is_completed


def parse_sumit_file(filepath: str, config: ReportConfig, tax_year: int) -> Tuple[pd.DataFrame, Dict[str, pd.Series], List[str]]:
    """
    Convenience function to parse SUMIT file.
    
    Returns:
        Tuple of (parsed_df, lookup_dict, warnings)
    """
    parser = SUMITParser(config)
    df = parser.parse(filepath, tax_year)
    lookup = parser.build_lookup(df)
    return df, lookup, parser.parse_warnings
