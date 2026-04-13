"""
Summit CRM taxonomy lookups.

Maps IDOM field values → Summit entity reference IDs.
Partial data hardcoded from live Summit API (April 13, 2026).
Missing entries loaded at runtime via load_full_taxonomies().

To refresh all: call load_full_taxonomies(api_client) once.
"""
from typing import Dict, List, Optional
import re
import json
import logging
from pathlib import Path
import os

logger = logging.getLogger(__name__)

# ── שנת מס (Tax Year) — folder 1125523044 ──
TAX_YEARS: Dict[int, int] = {
    2022: 1178858422,
    2023: 1142927704,
    2024: 1125575564,
    2025: 1125583827,
    2026: 1125583873,
}

# ── סטטוס דוח (Report Status) — folder 1125161773 ──
STATUS_PRE_WORK_ID = 1125882177        # 1) טרום עבודה
STATUS_PRELIMINARY_ID = 1125884921     # 2) עבודה מקדימה
STATUS_AUDIT_ID = 1125884972           # 3) ביקורת
STATUS_DRAFT_ID = 1125885752           # 4) טיוטה
STATUS_FIXES_ID = 1125885763           # 5) השלמות ותיקונים
STATUS_MANAGER_APPROVAL_ID = 1125886051  # 6) אישור מנהל תיק
STATUS_SUBMISSION_ID = 1125886084      # 7) שידור והגשה
STATUS_SIGNATURE_ID = 1156959068       # 8) חתימה
STATUS_COMPLETED_ID = 1125886300       # 9) תהליך הושלם

STATUSES: Dict[int, str] = {
    STATUS_PRE_WORK_ID: "1) טרום עבודה",
    STATUS_PRELIMINARY_ID: "2) עבודה מקדימה",
    STATUS_AUDIT_ID: "3) ביקורת",
    STATUS_DRAFT_ID: "4) טיוטה",
    STATUS_FIXES_ID: "5) השלמות ותיקונים",
    STATUS_MANAGER_APPROVAL_ID: "6) אישור מנהל תיק",
    STATUS_SUBMISSION_ID: "7) שידור והגשה",
    STATUS_SIGNATURE_ID: "8) חתימה",
    STATUS_COMPLETED_ID: "9) תהליך הושלם",
}

# ── פקיד שומה (Tax Assessor) — folder 1081741878 ──
# Format: "city - code". IDOM פ.ש field matches trailing code number.
# Partial list — call load_full_taxonomies() to fill the rest.
PKID_SHOMA: List[dict] = [
    {"id": 1099384287, "label": "רחובות - 26", "code": "26"},
    {"id": 1099384289, "label": "ירושלים 2 - 45", "code": "45"},
    {"id": 1099384290, "label": "תל אביב 3 - 38", "code": "38"},
    {"id": 1099384291, "label": "לא מייצג תיק", "code": ""},
    {"id": 1099384292, "label": "תל אביב 4 - 34", "code": "34"},
    {"id": 1099384296, "label": "אשקלון - 51", "code": "51"},
]

# ── סוג תיק (File Type) — folder 1081741713 ──
# Numeric codes. IDOM סוג_תיק field is direct match.
SUG_TIK: List[dict] = [
    {"id": 1099349748, "label": "7", "code": "7"},
    {"id": 1099349795, "label": "10", "code": "10"},
    {"id": 1099350031, "label": "9", "code": "9"},
    {"id": 1099350048, "label": "21", "code": "21"},
    {"id": 1099350811, "label": "14", "code": "14"},
    {"id": 1099350822, "label": "20", "code": "20"},
]

# ── Indexes (built once, rebuilt after loading) ──
_PKID_SHOMA_BY_CODE: Dict[str, dict] = {}
_SUG_TIK_BY_CODE: Dict[str, dict] = {}

# Persistent cache path (Railway Volume or local)
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
TAXONOMY_CACHE = DATA_DIR / "taxonomy_cache.json"


def _build_indexes():
    """Build lookup indexes from lists."""
    global _PKID_SHOMA_BY_CODE, _SUG_TIK_BY_CODE
    _PKID_SHOMA_BY_CODE = {e["code"]: e for e in PKID_SHOMA if e.get("code")}
    _SUG_TIK_BY_CODE = {e["code"]: e for e in SUG_TIK if e.get("code")}


_build_indexes()


def resolve_tax_year(year: int) -> Optional[int]:
    """Resolve tax year to Summit entity ID."""
    return TAX_YEARS.get(year)


def resolve_status(has_submission: bool) -> int:
    """Resolve report status based on whether IDOM has a submission date."""
    return STATUS_COMPLETED_ID if has_submission else STATUS_PRE_WORK_ID


def resolve_pkid_shoma(code: str) -> Optional[dict]:
    """
    Resolve פקיד שומה by IDOM code (e.g., '38' → תל אביב 3).
    Returns dict with 'id' and 'label', or None if not found.
    """
    code = str(code).strip()
    return _PKID_SHOMA_BY_CODE.get(code)


def resolve_sug_tik(code: str) -> Optional[dict]:
    """
    Resolve סוג תיק by IDOM code (e.g., '7').
    Returns dict with 'id' and 'label', or None if not found.
    """
    code = str(code).strip()
    return _SUG_TIK_BY_CODE.get(code)


def get_status_label(entity_id: int) -> str:
    """Get status label by entity ID."""
    return STATUSES.get(entity_id, "Unknown (%d)" % entity_id)


def is_loaded() -> bool:
    """Check if full taxonomies have been loaded."""
    return len(PKID_SHOMA) > 10  # we start with 6, full is 33


def load_full_taxonomies(api_client) -> None:
    """
    Fetch all taxonomy entries from Summit API and update local tables.
    Call once to fill incomplete hardcoded tables.
    Caches to disk so subsequent runs don't re-fetch.
    """
    global PKID_SHOMA, SUG_TIK

    # Try loading from disk cache first
    if _load_cache():
        logger.info("Loaded taxonomies from cache")
        return

    logger.info("Fetching full taxonomies from Summit API...")

    # Load פקיד שומה (folder 1081741878)
    _fetch_taxonomy(
        api_client, "1081741878", "פקיד שומה", PKID_SHOMA,
        code_extractor=lambda label: _extract_trailing_number(label),
    )

    # Load סוג תיק (folder 1081741713)
    _fetch_taxonomy(
        api_client, "1081741713", "סוג תיק", SUG_TIK,
        code_extractor=lambda label: label.strip(),
    )

    _build_indexes()
    _save_cache()

    logger.info(
        "Loaded taxonomies: %d פקיד שומה, %d סוג תיק",
        len(PKID_SHOMA), len(SUG_TIK),
    )


def _fetch_taxonomy(api_client, folder_id, field_name, target_list, code_extractor):
    """Fetch all entities from a taxonomy folder and append to target_list."""
    ids = api_client.list_entities(folder_id)
    existing_ids = {e["id"] for e in target_list}

    for eid in ids:
        if eid in existing_ids:
            continue
        entity = api_client.get_entity(eid, folder_id)
        if not entity:
            continue
        raw = entity.get(field_name, [])
        label = str(raw[0]) if isinstance(raw, list) and raw else ""
        code = code_extractor(label)
        target_list.append({"id": eid, "label": label, "code": code})


def _extract_trailing_number(label: str) -> str:
    """Extract trailing number from labels like 'תל אביב 3 - 38' → '38'."""
    match = re.search(r'(\d+)\s*$', label)
    return match.group(1) if match else ""


def _load_cache() -> bool:
    """Load taxonomy data from disk cache. Returns True if loaded."""
    global PKID_SHOMA, SUG_TIK
    if not TAXONOMY_CACHE.exists():
        return False
    try:
        with open(TAXONOMY_CACHE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("pkid_shoma") and len(data["pkid_shoma"]) > 10:
            PKID_SHOMA = data["pkid_shoma"]
        if data.get("sug_tik") and len(data["sug_tik"]) > 10:
            SUG_TIK = data["sug_tik"]
        _build_indexes()
        return len(PKID_SHOMA) > 10
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load taxonomy cache: %s", e)
        return False


def _save_cache():
    """Persist taxonomy data to disk."""
    try:
        TAXONOMY_CACHE.parent.mkdir(parents=True, exist_ok=True)
        with open(TAXONOMY_CACHE, "w", encoding="utf-8") as f:
            json.dump(
                {"pkid_shoma": PKID_SHOMA, "sug_tik": SUG_TIK},
                f, ensure_ascii=False, indent=2,
            )
        logger.info("Saved taxonomy cache to %s", TAXONOMY_CACHE)
    except OSError as e:
        logger.warning("Failed to save taxonomy cache: %s", e)
