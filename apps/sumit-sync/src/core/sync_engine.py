"""
IDOM→SUMIT Sync Engine - Core Engine
Matching, transformation, and output generation.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from dataclasses import dataclass, field
import logging

from .config import (
    ReportConfig, ReportType, 
    STATUS_COMPLETED, STATUS_COMPLETED_LABEL,
    IMPORT_MAPPINGS
)

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    """Result of sync operation."""
    # Counts
    total_idom_records: int = 0
    total_sumit_records: int = 0
    matched_count: int = 0
    unmatched_count: int = 0
    changed_count: int = 0
    unchanged_count: int = 0
    status_completed_count: int = 0
    status_preserved_count: int = 0
    status_regression_flags: int = 0
    
    # DataFrames
    import_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    diff_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    exceptions_df: pd.DataFrame = field(default_factory=pd.DataFrame)
    
    # Per-record regression details (populated by engine)
    regression_records: List[Dict[str, str]] = field(default_factory=list)

    # Warnings
    warnings: List[str] = field(default_factory=list)


@dataclass
class FieldChange:
    """Record of a field change."""
    מזהה: str
    שם: str
    field_name: str
    old_value: Any
    new_value: Any
    change_type: str  # 'update', 'status_completion', 'extension_update'


class SyncEngine:
    """
    Core sync engine for IDOM→SUMIT synchronization.
    """
    
    def __init__(self, config: ReportConfig):
        self.config = config
        self.import_mapping = IMPORT_MAPPINGS[config.report_type]
    
    def sync(
        self,
        idom_df: pd.DataFrame,
        sumit_df: pd.DataFrame,
        sumit_lookup: Dict[str, pd.Series],
        tax_year: int
    ) -> SyncResult:
        """
        Perform the sync operation.
        
        Args:
            idom_df: Parsed IDOM DataFrame
            sumit_df: Parsed SUMIT DataFrame
            sumit_lookup: Lookup dict from match key to SUMIT record
            tax_year: Tax year being processed
            
        Returns:
            SyncResult with all output data
        """
        result = SyncResult()
        result.total_idom_records = len(idom_df)
        result.total_sumit_records = len(sumit_df)
        
        logger.info(f"Starting sync: {len(idom_df)} IDOM records, {len(sumit_df)} SUMIT records")
        
        # Match records
        matched_records = []
        unmatched_records = []
        changes: List[FieldChange] = []
        
        for _, idom_row in idom_df.iterrows():
            match_key = idom_row['מספר_תיק']
            
            # Try primary match
            sumit_row = sumit_lookup.get(match_key)
            
            # If no match, try secondary normalized match (without leading zeros)
            if sumit_row is None and match_key:
                normalized_key = match_key.lstrip('0')
                if normalized_key != match_key:
                    for sk, sr in sumit_lookup.items():
                        if sk.lstrip('0') == normalized_key:
                            sumit_row = sr
                            result.warnings.append(
                                f"התאמה משנית עבור {match_key} → {sk} (אפסים מובילים)"
                            )
                            break
            
            if sumit_row is None:
                # Unmatched - add to exceptions
                exception_row = self._create_exception_row(idom_row, 'no_sumit_match')
                unmatched_records.append(exception_row)
                continue
            
            # Matched - process update
            import_row, row_changes, flags = self._process_match(
                idom_row, sumit_row, tax_year
            )
            
            matched_records.append(import_row)
            changes.extend(row_changes)
            
            if flags.get('status_regression'):
                result.status_regression_flags += 1
                if 'regression_detail' in flags:
                    result.regression_records.append(flags['regression_detail'])
            if flags.get('status_completed'):
                result.status_completed_count += 1
            else:
                result.status_preserved_count += 1
        
        # Build result DataFrames
        result.matched_count = len(matched_records)
        result.unmatched_count = len(unmatched_records)
        
        if matched_records:
            result.import_df = pd.DataFrame(matched_records)
            # Ensure column order matches import schema
            result.import_df = result.import_df[self.config.import_schema.columns]
        
        if unmatched_records:
            result.exceptions_df = pd.DataFrame(unmatched_records)
        
        # Build diff report
        result.diff_df = self._build_diff_report(changes)
        result.changed_count = len([c for c in changes if c.change_type != 'no_change'])
        result.unchanged_count = result.matched_count - len(set(c.מזהה for c in changes if c.change_type != 'no_change'))
        
        # Add warning for partial export
        if result.unmatched_count > 0:
            result.warnings.append(
                f"⚠️ {result.unmatched_count} רשומות IDOM ללא התאמה ב-SUMIT. "
                "ייתכן ייצוא SUMIT חלקי/מסונן, או לקוחות חדשים."
            )
        
        logger.info(f"Sync complete: {result.matched_count} matched, {result.unmatched_count} unmatched")
        
        return result
    
    def _process_match(
        self,
        idom_row: pd.Series,
        sumit_row: pd.Series,
        tax_year: int
    ) -> Tuple[Dict[str, Any], List[FieldChange], Dict[str, bool]]:
        """
        Process a matched record pair.
        
        Returns:
            Tuple of (import_row_dict, changes_list, flags_dict)
        """
        import_row = {}
        changes = []
        flags: Dict[str, Any] = {'status_completed': False, 'status_regression': False}

        sumit_id = str(sumit_row.get('מזהה', ''))
        if sumit_id.endswith('.0'):
            sumit_id = sumit_id[:-2]

        idom_ref = str(idom_row.get('מספר_תיק', ''))
        client_name = self._extract_name(idom_row, sumit_row)

        # Get current SUMIT status
        current_status = sumit_row.get('סטטוס', '')
        current_status_str = str(current_status) if pd.notna(current_status) else ''
        is_currently_completed = STATUS_COMPLETED in current_status_str

        # Check if IDOM has submission date
        has_submission = pd.notna(idom_row.get('תאריך_הגשה'))

        # Derive new status
        if has_submission:
            new_status = STATUS_COMPLETED
            flags['status_completed'] = True
        elif is_currently_completed:
            # Preserve completed status - never downgrade
            new_status = current_status_str
            flags['status_regression'] = True  # Flag for review
            flags['regression_detail'] = {
                'idom_ref': idom_ref,
                'sumit_ref': sumit_id,
                'client_name': client_name,
                'status': current_status_str,
            }
        else:
            # Preserve existing status
            new_status = current_status_str
        
        # Derive extension date
        idom_extension = idom_row.get('תאריך_ארכה')
        sumit_extension = sumit_row.get('אורכה משרד')
        new_extension = idom_extension if pd.notna(idom_extension) else sumit_extension
        
        # Derive submission date
        idom_submission = idom_row.get('תאריך_הגשה')
        sumit_submission = sumit_row.get('הגשה')
        new_submission = idom_submission if pd.notna(idom_submission) else sumit_submission
        
        # Build import row using mapping
        for import_col, source in self.import_mapping.items():
            if source == '_DERIVED_STATUS':
                import_row[import_col] = new_status
                # Record change if different
                if new_status != current_status_str:
                    changes.append(FieldChange(
                        מזהה=sumit_id,
                        שם=client_name,
                        field_name='סטטוס',
                        old_value=current_status_str,
                        new_value=new_status,
                        change_type='status_completion' if has_submission else 'status_preserved'
                    ))
            elif source == '_DERIVED_EXTENSION':
                import_row[import_col] = new_extension
                old_ext = sumit_row.get('אורכה משרד')
                if self._values_differ(new_extension, old_ext):
                    changes.append(FieldChange(
                        מזהה=sumit_id,
                        שם=client_name,
                        field_name='אורכה משרד',
                        old_value=old_ext,
                        new_value=new_extension,
                        change_type='extension_update'
                    ))
            elif source == '_DERIVED_SUBMISSION':
                import_row[import_col] = new_submission
                old_sub = sumit_row.get('הגשה')
                if self._values_differ(new_submission, old_sub):
                    changes.append(FieldChange(
                        מזהה=sumit_id,
                        שם=client_name,
                        field_name='הגשה',
                        old_value=old_sub,
                        new_value=new_submission,
                        change_type='update'
                    ))
            else:
                # Direct mapping from SUMIT
                value = sumit_row.get(source, '')
                import_row[import_col] = value if pd.notna(value) else ''
        
        return import_row, changes, flags
    
    def _create_exception_row(self, idom_row: pd.Series, reason: str) -> Dict[str, Any]:
        """Create an exception record for unmatched IDOM row."""
        return {
            'exception_type': reason,
            'מספר_תיק': idom_row.get('מספר_תיק', ''),
            'שם': idom_row.get('שם', ''),
            'תאריך_ארכה': idom_row.get('תאריך_ארכה', ''),
            'תאריך_הגשה': idom_row.get('תאריך_הגשה', ''),
            'קוד_שידור': idom_row.get('קוד_שידור', ''),
            'notes': 'רשומת IDOM ללא התאמה בייצוא SUMIT. ייתכן לקוח חדש או סינון ייצוא.'
        }
    
    def _extract_name(self, idom_row: pd.Series, sumit_row: pd.Series) -> str:
        """Extract client name from IDOM or SUMIT."""
        # Try IDOM first
        name = idom_row.get('שם', '')
        if pd.notna(name) and str(name).strip():
            return str(name).strip()
        
        # Fall back to SUMIT כרטיס לקוח (ID: Name format)
        kartis = sumit_row.get('כרטיס לקוח', '')
        if pd.notna(kartis):
            kartis_str = str(kartis)
            if ':' in kartis_str:
                return kartis_str.split(':', 1)[1].strip()
            return kartis_str
        
        return ''
    
    @staticmethod
    def _values_differ(val1: Any, val2: Any) -> bool:
        """Check if two values are meaningfully different."""
        # Handle None/NaN
        if pd.isna(val1) and pd.isna(val2):
            return False
        if pd.isna(val1) or pd.isna(val2):
            return True
        
        # Compare as strings for consistency
        str1 = str(val1).strip()
        str2 = str(val2).strip()
        
        # Handle datetime formatting differences
        if isinstance(val1, (datetime, pd.Timestamp)):
            str1 = val1.strftime('%Y-%m-%d') if pd.notna(val1) else ''
        if isinstance(val2, (datetime, pd.Timestamp)):
            str2 = val2.strftime('%Y-%m-%d') if pd.notna(val2) else ''
        
        return str1 != str2
    
    def _build_diff_report(self, changes: List[FieldChange]) -> pd.DataFrame:
        """Build diff report DataFrame from changes list."""
        if not changes:
            return pd.DataFrame(columns=['מזהה', 'שם', 'field', 'old_value', 'new_value', 'change_type'])
        
        rows = []
        for change in changes:
            rows.append({
                'מזהה': change.מזהה,
                'שם': change.שם,
                'field': change.field_name,
                'old_value': self._format_value(change.old_value),
                'new_value': self._format_value(change.new_value),
                'change_type': change.change_type
            })
        
        return pd.DataFrame(rows)
    
    @staticmethod
    def _format_value(value: Any) -> str:
        """Format value for display in diff report."""
        if pd.isna(value):
            return ''
        if isinstance(value, (datetime, pd.Timestamp)):
            return value.strftime('%Y-%m-%d')
        return str(value)


def run_sync(
    idom_df: pd.DataFrame,
    sumit_df: pd.DataFrame,
    sumit_lookup: Dict[str, pd.Series],
    config: ReportConfig,
    tax_year: int
) -> SyncResult:
    """
    Convenience function to run sync.
    """
    engine = SyncEngine(config)
    return engine.sync(idom_df, sumit_df, sumit_lookup, tax_year)
