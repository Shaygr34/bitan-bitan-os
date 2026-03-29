"""
Summit API Data Source — fetches report data directly from Summit CRM API.

Produces the exact same output as sumit_parser.parse_sumit_file():
    (DataFrame, lookup_dict, warnings)

Same column names, same "ID: Label" entity reference format, same date types.
Drop-in replacement for the XLSX-based flow.
"""

import pandas as pd
import numpy as np
import re
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from .config import (
    ReportConfig, ReportType,
    FINANCIAL_CONFIG, ANNUAL_CONFIG,
    STATUS_COMPLETED,
)
from .sumit_api_client import SummitAPIClient
from .mapping_store import MappingStore

logger = logging.getLogger(__name__)

# Summit CRM folder IDs
FOLDER_IDS = {
    ReportType.FINANCIAL: "1124761700",  # דוחות כספיים
    ReportType.ANNUAL: "1144157121",     # דוחות שנתיים
}
CLIENTS_FOLDER = "557688522"  # לקוחות

# Field mapping: Summit API entity field → SUMIT export column name
# Summit API returns Hebrew field names; SUMIT export uses slightly different names
FIELD_MAP_FINANCIAL = {
    # API field name → SUMIT export column name
    "לקוח": "כרטיס לקוח",                           # entity ref → "ID: Name"
    "סטטוס": "סטטוס",                               # entity ref → "ID: Name"
    "שנת מס": "שנת מס",                             # entity ref → "ID: Name"
    "עובד מטפל": "עובד מטפל",                       # entity ref → "ID: Name"
    "עובד ע. מקדימה": "עובד ע. מקדימה",             # entity ref → "ID: Name"
    "הערות": "הערות",                                # text
    "חבות מס": "חבות מס",                           # number
    "תאריך תחילת עבודה": "תחילת עבודה",             # date
    "תאריך סיום עבודה מקדימה": "סיום עבודה מקדימה",  # date
    "תאריך הגשה": "הגשה",                           # date
    "תאריך אורכה מ\"ה": "אורכה מ\"ה",               # date
    "תאריך אורכה משרד": "אורכה משרד",               # date
}

FIELD_MAP_ANNUAL = {
    "לקוח": "כרטיס לקוח",
    "סטטוס": "סטטוס",
    "שנת מס": "שנת מס",
    "עובד מטפל": "עובד מטפל",
    "עובד ע.מקדימה": "עובד ע.מקדימה",
    "הערות": "הערות",
    "חבות מס": "חבות מס",
    "חבות ביטוח לאומי": "חבות ביטוח לאומי",
    "תאריך תחילת עבודה": "תחילת עבודה",
    "תאריך סיום עבודה מקדימה": "סיום עבודה מקדימה",
    "תאריך הגשה": "הגשה",
    "תאריך אורכה מ\"ה": "אורכה מ\"ה",
    "תאריך אורכה משרד": "אורכה משרד",
}

FIELD_MAPS = {
    ReportType.FINANCIAL: FIELD_MAP_FINANCIAL,
    ReportType.ANNUAL: FIELD_MAP_ANNUAL,
}


def _format_entity_ref(field_value) -> str:
    """
    Convert Summit entity reference to "ID: Label" format.
    Summit returns: [{"ID": 1125886300, "Name": "9) תהליך הושלם", ...}]
    SUMIT export shows: "1125886300: 9) תהליך הושלם"
    """
    if not field_value:
        return ""
    if isinstance(field_value, list) and field_value:
        ref = field_value[0]
        if isinstance(ref, dict) and "ID" in ref:
            return f"{ref['ID']}: {ref.get('Name', '')}"
    return str(field_value)


def _extract_date(field_value) -> Optional[pd.Timestamp]:
    """
    Extract date from Summit API field value.
    Summit returns: ["2025-12-31T00:00:00+02:00"] or null
    """
    if not field_value:
        return pd.NaT
    if isinstance(field_value, list) and field_value:
        val = field_value[0]
        if val is None:
            return pd.NaT
        try:
            return pd.to_datetime(val, utc=True).tz_localize(None)
        except (ValueError, TypeError):
            return pd.NaT
    return pd.NaT


def _extract_number(field_value) -> float:
    """Extract number from Summit field value array."""
    if not field_value:
        return 0.0
    if isinstance(field_value, list) and field_value:
        val = field_value[0]
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                pass
    return 0.0


def _extract_text(field_value) -> str:
    """Extract text from Summit field value array."""
    if not field_value:
        return ""
    if isinstance(field_value, list) and field_value:
        val = field_value[0]
        if isinstance(val, dict):
            # Rich text — take Item1 (plain text version)
            return str(val.get("Item1", val.get("Item2", "")))
        return str(val) if val is not None else ""
    return str(field_value) if field_value else ""


def _extract_client_id(field_value) -> Optional[int]:
    """Extract client entity ID from לקוח reference field."""
    if not field_value:
        return None
    if isinstance(field_value, list) and field_value:
        ref = field_value[0]
        if isinstance(ref, dict) and "ID" in ref:
            return ref["ID"]
    return None


def _extract_client_name(field_value) -> str:
    """Extract client name from לקוח reference field."""
    if not field_value:
        return ""
    if isinstance(field_value, list) and field_value:
        ref = field_value[0]
        if isinstance(ref, dict) and "Name" in ref:
            return ref["Name"]
    return ""


# Date fields in the export schema
DATE_FIELDS = {"תחילת עבודה", "סיום עבודה מקדימה", "הגשה", "אורכה מ\"ה", "אורכה משרד"}

# Entity reference fields (rendered as "ID: Label")
ENTITY_REF_API_FIELDS = {"לקוח", "סטטוס", "שנת מס", "עובד מטפל", "עובד ע. מקדימה", "עובד ע.מקדימה"}

# Number fields
NUMBER_FIELDS = {"חבות מס", "חבות ביטוח לאומי"}


def fetch_sumit_data(
    config: ReportConfig,
    tax_year: int,
    client: Optional[SummitAPIClient] = None,
    mapping: Optional[MappingStore] = None,
    progress_callback=None,
) -> Tuple[pd.DataFrame, Dict[str, pd.Series], List[str]]:
    """
    Fetch report data from Summit API and produce output compatible with parse_sumit_file().

    Args:
        config: Report configuration (financial or annual)
        tax_year: Tax year to filter
        client: Optional pre-configured API client
        mapping: Optional pre-loaded mapping store
        progress_callback: Optional (stage, current, total) callback

    Returns:
        Tuple of (parsed_df, lookup_dict, warnings) — same as parse_sumit_file()
    """
    warnings = []
    api = client or SummitAPIClient()
    store = mapping or MappingStore()

    folder_id = FOLDER_IDS[config.report_type]
    field_map = FIELD_MAPS[config.report_type]
    match_key_header = config.export_schema.match_key_header  # "ח.פ" or "ת\"ז/ח\"פ"

    if progress_callback:
        progress_callback("listing", 0, 0)

    # Step 1: List all entity IDs in the report folder
    entity_ids = api.list_entities(folder_id)
    logger.info("Found %d report entities in %s", len(entity_ids), folder_id)

    if progress_callback:
        progress_callback("fetching_reports", 0, len(entity_ids))

    # Step 2: Fetch full entity details
    entities = []
    for i, eid in enumerate(entity_ids):
        entity = api.get_entity(eid, folder_id)
        if entity:
            entities.append(entity)
        if progress_callback and (i + 1) % 25 == 0:
            progress_callback("fetching_reports", i + 1, len(entity_ids))

    logger.info("Fetched %d report entities (skipped %d empty/archived)",
                len(entities), len(entity_ids) - len(entities))

    if progress_callback:
        progress_callback("fetching_reports", len(entity_ids), len(entity_ids))

    # Step 3: Filter by tax year
    year_filtered = []
    for entity in entities:
        year_ref = entity.get("שנת מס", [])
        if isinstance(year_ref, list) and year_ref:
            ref = year_ref[0]
            if isinstance(ref, dict):
                year_name = str(ref.get("Name", ""))
                match = re.search(r'(\d{4})', year_name)
                if match and int(match.group(1)) == tax_year:
                    year_filtered.append(entity)
            elif str(ref) == str(tax_year):
                year_filtered.append(entity)

    removed = len(entities) - len(year_filtered)
    if removed > 0:
        logger.info("Filtered out %d entities (not tax year %d)", removed, tax_year)
    if not year_filtered:
        warnings.append(f"No records found for tax year {tax_year}")

    # Step 4: Resolve client company numbers
    # Collect all unique client IDs that need lookup
    client_ids_needed = set()
    entity_client_map = {}  # entity_id → client_id
    client_names = {}       # client_id → name (from entity references)

    for entity in year_filtered:
        client_id = _extract_client_id(entity.get("לקוח"))
        if client_id:
            entity_client_map[entity["ID"]] = client_id
            client_name = _extract_client_name(entity.get("לקוח"))
            if client_name:
                client_names[client_id] = client_name
            if not store.has_client(client_id):
                client_ids_needed.add(client_id)

    if client_ids_needed:
        logger.info("Need to resolve %d new client company numbers", len(client_ids_needed))
        if progress_callback:
            progress_callback("resolving_clients", 0, len(client_ids_needed))

        for i, cid in enumerate(client_ids_needed):
            cn = api.get_client_company_number(cid)
            if cn:
                name = client_names.get(cid, "")
                store.add(cid, cn, name)
            else:
                warnings.append(f"Client {cid} has no company number")

            if progress_callback and (i + 1) % 25 == 0:
                progress_callback("resolving_clients", i + 1, len(client_ids_needed))

        store.save()
        if progress_callback:
            progress_callback("resolving_clients", len(client_ids_needed), len(client_ids_needed))

    # Step 5: Build DataFrame rows matching SUMIT export format
    rows = []
    skipped_no_match_key = 0

    for entity in year_filtered:
        row = {}

        # Entity ID → מזהה
        row["מזהה"] = str(entity["ID"])

        # Match key (ח.פ or ת"ז/ח"פ) from client mapping
        client_id = entity_client_map.get(entity["ID"])
        if client_id:
            company_number = store.get_company_number(client_id)
            row[match_key_header] = company_number or ""
        else:
            row[match_key_header] = ""

        if not row[match_key_header]:
            skipped_no_match_key += 1

        # Map each API field to export column
        for api_field, export_col in field_map.items():
            raw_value = entity.get(api_field)

            if api_field in ENTITY_REF_API_FIELDS:
                row[export_col] = _format_entity_ref(raw_value)
            elif export_col in DATE_FIELDS:
                row[export_col] = _extract_date(raw_value)
            elif api_field in NUMBER_FIELDS:
                row[export_col] = _extract_number(raw_value)
            else:
                row[export_col] = _extract_text(raw_value)

        # Additional columns from export schema that we haven't mapped
        # מספר לקוח — client number (from client entity ref)
        if client_id:
            row["מספר לקוח"] = str(client_id)
        else:
            row["מספר לקוח"] = ""

        rows.append(row)

    if skipped_no_match_key > 0:
        warnings.append(
            f"{skipped_no_match_key} records have no company number (missing client mapping)"
        )

    # Step 6: Build DataFrame
    if not rows:
        df = pd.DataFrame(columns=config.export_schema.all_columns)
    else:
        df = pd.DataFrame(rows)
        # Ensure all expected columns exist
        for col in config.export_schema.all_columns:
            if col not in df.columns:
                df[col] = ""

    # Add match key columns (same as SUMITParser.parse())
    df["_match_key"] = df[match_key_header].apply(_normalize_key)
    df["_match_key_raw"] = df[match_key_header].apply(
        lambda x: str(x) if pd.notna(x) else ""
    )

    # Step 7: Build lookup
    lookup = _build_lookup(df)

    logger.info(
        "API source: %d records, %d with match keys, %d lookup entries, %d API calls",
        len(df),
        len(df[df["_match_key"] != ""]),
        len(lookup),
        api.call_count,
    )

    return df, lookup, warnings


def _normalize_key(value) -> str:
    """Normalize match key: extract digits only. Same as SUMITParser._normalize_key."""
    if pd.isna(value) or value == "":
        return ""
    val_str = str(value)
    if "." in val_str:
        try:
            val_str = str(int(float(val_str)))
        except (ValueError, OverflowError):
            pass
    digits = re.sub(r'[^\d]', '', val_str)
    return digits


def _build_lookup(df: pd.DataFrame) -> Dict[str, pd.Series]:
    """Build lookup dictionary from match key to record. Same as SUMITParser.build_lookup."""
    lookup = {}
    for _, row in df.iterrows():
        key = row["_match_key"]
        if key and key not in lookup:
            lookup[key] = row
            # Also add normalized version (stripped leading zeros)
            normalized = key.lstrip("0")
            if normalized and normalized != key and normalized not in lookup:
                lookup[normalized] = row
    return lookup
