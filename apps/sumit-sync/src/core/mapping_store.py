"""
Persistent mapping store: client entity ID → ח.פ/ת"ז (company number).

Stored as JSON on Railway Volume. Once a client's company number is resolved,
it's cached permanently (company numbers don't change).

The mapping is shared across report types — a single client may have both
annual and financial reports.
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
MAPPING_FILE = DATA_DIR / "client_mapping.json"


class MappingStore:
    """
    Bidirectional mapping between Summit client entity IDs and company numbers (ח.פ/ת"ז).

    Structure:
    {
        "client_to_company": { "1223591798": "516582061", ... },
        "company_to_client": { "516582061": "1223591798", ... },
        "client_names": { "1223591798": "גו סווימינג בע\"מ", ... }
    }
    """

    def __init__(self, path: Optional[Path] = None):
        self.path = path or MAPPING_FILE
        self._data: Dict[str, Dict[str, str]] = {
            "client_to_company": {},
            "company_to_client": {},
            "client_names": {},
        }
        self._load()

    def _load(self):
        """Load mapping from disk if it exists."""
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                # Merge into structure (handles legacy format)
                self._data["client_to_company"] = loaded.get("client_to_company", {})
                self._data["company_to_client"] = loaded.get("company_to_client", {})
                self._data["client_names"] = loaded.get("client_names", {})
                logger.info(
                    "Loaded mapping: %d client↔company entries",
                    len(self._data["client_to_company"]),
                )
            except (json.JSONDecodeError, OSError) as e:
                logger.warning("Failed to load mapping file, starting fresh: %s", e)

    def _save(self):
        """Persist mapping to disk."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def add(self, client_id: int, company_number: str, client_name: str = ""):
        """Add a client → company number mapping."""
        cid = str(client_id)
        cn = company_number.strip()
        if not cn:
            return

        self._data["client_to_company"][cid] = cn
        self._data["company_to_client"][cn] = cid
        if client_name:
            self._data["client_names"][cid] = client_name

    def get_company_number(self, client_id: int) -> Optional[str]:
        """Look up company number by client entity ID."""
        return self._data["client_to_company"].get(str(client_id))

    def get_client_id(self, company_number: str) -> Optional[str]:
        """Look up client entity ID by company number."""
        return self._data["company_to_client"].get(company_number.strip())

    def get_client_name(self, client_id: int) -> str:
        """Get cached client name."""
        return self._data["client_names"].get(str(client_id), "")

    def has_client(self, client_id: int) -> bool:
        """Check if client ID is already mapped."""
        return str(client_id) in self._data["client_to_company"]

    def unmapped_clients(self, client_ids: set) -> set:
        """Return client IDs that don't have a mapping yet."""
        return {cid for cid in client_ids if str(cid) not in self._data["client_to_company"]}

    def save(self):
        """Explicit save (call after batch updates)."""
        self._save()
        logger.info("Saved mapping: %d entries", len(self._data["client_to_company"]))

    @property
    def size(self) -> int:
        return len(self._data["client_to_company"])

    def to_summary(self) -> Dict[str, int]:
        """Return summary stats."""
        return {
            "total_mappings": len(self._data["client_to_company"]),
            "with_names": len(self._data["client_names"]),
        }
