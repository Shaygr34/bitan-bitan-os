"""
IDOM→SUMIT Sync Engine - Configuration
Type-specific schemas and rules for Financial and Annual reports.

THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR ALL COLUMN NAMES AND SCHEMAS.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from enum import Enum


class ReportType(Enum):
    FINANCIAL = "financial"
    ANNUAL = "annual"


# Status codes
STATUS_COMPLETED = "1125886300"
STATUS_COMPLETED_LABEL = "1125886300: 9) תהליך הושלם"


@dataclass
class IDOMSchema:
    """Schema for SHAAM/IDOM paste data - resolved by header detection."""
    # Headers to detect (Hebrew)
    HEADERS = {
        'קוד_שידור': ['קוד שידור'],
        'תאריך_ארכה': ['תאריך ארכה', 'מועד חוקי/ תאריך ארכה', 'מועד חוקי'],
        'תאריך_הגשה': ['תאריך הגשה'],
        'מח': ['מח'],
        'שנת_שומה': ["ס'ש", 'ס״ש', 'שנת שומה'],
        'סוג_תיק': ['סוג תיק', 'סת'],
        'ח': ['ח'],
        'פקיד_שומה': ['פקיד שומה', 'פ.ש'],
        'שם': ['שם משפחה ופרטי', 'שם'],
        'מספר_תיק': ['מספר תיק'],
    }
    
    # Required fields for processing
    REQUIRED_FIELDS = ['מספר_תיק', 'תאריך_ארכה']
    
    # Field for matching
    MATCH_KEY = 'מספר_תיק'


@dataclass
class SUMITExportSchema:
    """Schema for SUMIT export file - type-specific."""
    match_key_column: str
    match_key_header: str
    id_column: str
    status_column: str
    extension_column: str
    submission_column: str
    year_column: str
    notes_column: str
    all_columns: List[str]
    # Required headers for validation
    required_headers: List[str]


@dataclass
class SUMITImportSchema:
    """Schema for SUMIT import file - type-specific."""
    columns: List[str]
    shaam_derived_fields: List[str]  # Fields that can be updated from SHAAM
    sumit_preserved_fields: List[str]  # Fields that should never be overwritten


@dataclass
class ReportConfig:
    """Complete configuration for a report type."""
    report_type: ReportType
    display_name: str
    display_name_en: str
    sumit_module: str
    export_schema: SUMITExportSchema
    import_schema: SUMITImportSchema
    # Minimum expected records in SUMIT export (for filtered export warning)
    min_expected_sumit_records: int = 50


# =============================================================================
# FINANCIAL REPORTS (דוחות כספיים) - Companies/Trusts
# =============================================================================

FINANCIAL_EXPORT_SCHEMA = SUMITExportSchema(
    match_key_column='E',
    match_key_header='ח.פ',
    id_column='A',
    status_column='K',
    extension_column='R',
    submission_column='O',
    year_column='B',
    notes_column='L',
    all_columns=[
        'מזהה', 'שנת מס', 'כרטיס לקוח', 'מספר לקוח', 'ח.פ',
        'מנהל תיק', 'מנהל/ת חשבונות', 'עובד/ת ביקורת', 'עובד ע. מקדימה', 'עובד מטפל',
        'סטטוס', 'הערות', 'תחילת עבודה', 'סיום עבודה מקדימה', 'הגשה',
        'חבות מס', 'אורכה מ"ה', 'אורכה משרד'
    ],
    required_headers=['מזהה', 'שנת מס', 'כרטיס לקוח', 'ח.פ', 'סטטוס']
)

# EXACT column names required by SUMIT import
FINANCIAL_IMPORT_COLUMNS = [
    'מזהה',
    'שנת מס', 
    'כרטיס לקוח', 
    'עובד ע. מקדימה',  # Note: WITH space for Financial
    'עובד מטפל',
    'סטטוס', 
    'הערות', 
    'חבות מס', 
    'תחילת עבודה', 
    'אורכה מ"ה',
    'אורכה משרד', 
    'סיום עבודה מקדימה', 
    'הגשה'
]

FINANCIAL_IMPORT_SCHEMA = SUMITImportSchema(
    columns=FINANCIAL_IMPORT_COLUMNS,
    shaam_derived_fields=['סטטוס', 'אורכה משרד', 'הגשה'],
    sumit_preserved_fields=[
        'מנהל תיק', 'מנהל/ת חשבונות', 'עובד/ת ביקורת', 
        'עובד ע. מקדימה', 'עובד מטפל', 'הערות', 
        'תחילת עבודה', 'סיום עבודה מקדימה', 'חבות מס'
    ]
)

FINANCIAL_CONFIG = ReportConfig(
    report_type=ReportType.FINANCIAL,
    display_name='דוחות כספיים',
    display_name_en='Financial Reports',
    sumit_module='דוחות כספיים',
    export_schema=FINANCIAL_EXPORT_SCHEMA,
    import_schema=FINANCIAL_IMPORT_SCHEMA,
    min_expected_sumit_records=50
)


# =============================================================================
# ANNUAL REPORTS (דוחות שנתיים) - Individuals
# =============================================================================

ANNUAL_EXPORT_SCHEMA = SUMITExportSchema(
    match_key_column='F',
    match_key_header='ת"ז/ח"פ',
    id_column='A',
    status_column='L',
    extension_column='U',
    submission_column='P',
    year_column='B',
    notes_column='Q',
    all_columns=[
        'מזהה', 'שנת מס', 'כרטיס לקוח', 'סוג לקוח', 'מספר לקוח', 'ת"ז/ח"פ',
        'מנהל תיק', 'מנהל/ת חשבונות', 'עובד/ת ביקורת', 'עובד ע.מקדימה', 'עובד מטפל',
        'סטטוס', 'תחילת עבודה', 'סיום עבודה מקדימה', 'דרישה לדוח מ"ה', 'הגשה',
        'הערות', 'חבות מס', 'חבות ביטוח לאומי', 'אורכה מ"ה', 'אורכה משרד'
    ],
    required_headers=['מזהה', 'שנת מס', 'כרטיס לקוח', 'ת"ז/ח"פ', 'סטטוס']
)

# EXACT column names required by SUMIT import - FROM OFFICIAL SCHEMA
ANNUAL_IMPORT_COLUMNS = [
    'מזהה',
    'שנת מס',
    'כרטיס לקוח',
    'עובד ע.מקדימה',      # NO space before dot - per SUMIT schema
    'עובד מטפל',
    'סטטוס',
    'הערות',
    'חבות מס',
    'חבות ביטוח לאומי',   # Full name - per SUMIT schema
    'תחילת עבודה',
    'אורכה מ"ה',
    'אורכה משרד',
    'סיום עבודה מקדימה',
    'הגשה'
]

ANNUAL_IMPORT_SCHEMA = SUMITImportSchema(
    columns=ANNUAL_IMPORT_COLUMNS,
    shaam_derived_fields=['סטטוס', 'אורכה משרד', 'הגשה'],
    sumit_preserved_fields=[
        'מנהל תיק', 'מנהל/ת חשבונות', 'עובד/ת ביקורת',
        'עובד ע.מקדימה', 'עובד מטפל', 'הערות',
        'תחילת עבודה', 'סיום עבודה מקדימה', 'חבות מס', 'חבות ביטוח לאומי'
    ]
)

ANNUAL_CONFIG = ReportConfig(
    report_type=ReportType.ANNUAL,
    display_name='דוחות שנתיים',
    display_name_en='Annual Reports',
    sumit_module='דוחות שנתיים',
    export_schema=ANNUAL_EXPORT_SCHEMA,
    import_schema=ANNUAL_IMPORT_SCHEMA,
    min_expected_sumit_records=100
)


# =============================================================================
# CONFIG LOOKUP
# =============================================================================

CONFIGS = {
    ReportType.FINANCIAL: FINANCIAL_CONFIG,
    ReportType.ANNUAL: ANNUAL_CONFIG,
    'financial': FINANCIAL_CONFIG,
    'annual': ANNUAL_CONFIG,
}


def get_config(report_type: str) -> ReportConfig:
    """Get configuration for a report type."""
    if report_type not in CONFIGS:
        raise ValueError(f"Unknown report type: {report_type}. Valid types: financial, annual")
    return CONFIGS[report_type]


# =============================================================================
# IMPORT FIELD MAPPINGS
# Source column in SUMIT export → Target column in import file
# Special values: _DERIVED_STATUS, _DERIVED_EXTENSION, _DERIVED_SUBMISSION
# =============================================================================

FINANCIAL_IMPORT_MAPPING = {
    'מזהה': 'מזהה',
    'שנת מס': 'שנת מס',
    'כרטיס לקוח': 'כרטיס לקוח',
    'עובד ע. מקדימה': 'עובד ע. מקדימה',
    'עובד מטפל': 'עובד מטפל',
    'סטטוס': '_DERIVED_STATUS',
    'הערות': 'הערות',
    'חבות מס': 'חבות מס',
    'תחילת עבודה': 'תחילת עבודה',
    'אורכה מ"ה': 'אורכה מ"ה',
    'אורכה משרד': '_DERIVED_EXTENSION',
    'סיום עבודה מקדימה': 'סיום עבודה מקדימה',
    'הגשה': '_DERIVED_SUBMISSION',
}

ANNUAL_IMPORT_MAPPING = {
    'מזהה': 'מזהה',
    'שנת מס': 'שנת מס',
    'כרטיס לקוח': 'כרטיס לקוח',
    'עובד ע.מקדימה': 'עובד ע.מקדימה',
    'עובד מטפל': 'עובד מטפל',
    'סטטוס': '_DERIVED_STATUS',
    'הערות': 'הערות',
    'חבות מס': 'חבות מס',
    'חבות ביטוח לאומי': 'חבות ביטוח לאומי',
    'תחילת עבודה': 'תחילת עבודה',
    'אורכה מ"ה': 'אורכה מ"ה',
    'אורכה משרד': '_DERIVED_EXTENSION',
    'סיום עבודה מקדימה': 'סיום עבודה מקדימה',
    'הגשה': '_DERIVED_SUBMISSION',
}

IMPORT_MAPPINGS = {
    ReportType.FINANCIAL: FINANCIAL_IMPORT_MAPPING,
    ReportType.ANNUAL: ANNUAL_IMPORT_MAPPING,
}
