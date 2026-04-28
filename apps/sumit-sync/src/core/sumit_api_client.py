"""
Summit CRM API Client — direct HTTP calls to api.sumit.co.il.

Bypasses the MCP proxy to access fields like Customers_CompanyNumber
that are redacted at the Claude↔human interface.

Rate limit handling: Summit returns 403 after ~100-150 rapid calls.
We batch requests with delays and exponential backoff on 403.
"""

import json
import os
import time
import logging
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from dataclasses import dataclass

logger = logging.getLogger(__name__)

BASE_URL = "https://api.sumit.co.il"
TIMEOUT_SECONDS = 15

# Rate limiting defaults
# Summit returns 403 after ~100-150 rapid calls. Being conservative.
CALLS_PER_BATCH = 90           # Summit threshold is ~100-150, pause at 90
DELAY_BETWEEN_CALLS = 0.35    # 350ms between calls (was 600ms)
BATCH_COOLDOWN = 20            # 20s pause every batch (was 65s)
MAX_RETRIES = 3
INITIAL_BACKOFF = 30           # First retry backoff in seconds (was 70s)


class SummitAPIError(Exception):
    """Error from Summit API response."""
    def __init__(self, status: int, user_message: str, technical_details: str = ""):
        self.status = status
        self.user_message = user_message
        self.technical_details = technical_details
        super().__init__(user_message or technical_details or f"Summit API error (status {status})")


class SummitRateLimitError(SummitAPIError):
    """Rate limit (403) from Summit API."""
    pass


@dataclass
class SummitCredentials:
    company_id: int
    api_key: str


class SummitAPIClient:
    """
    Direct HTTP client for Summit CRM API.

    Handles credential injection, rate limiting, pagination, and response parsing.
    All Summit endpoints are POST with JSON body.
    """

    def __init__(
        self,
        company_id: Optional[int] = None,
        api_key: Optional[str] = None,
    ):
        self.credentials = self._resolve_credentials(company_id, api_key)
        self._call_count = 0
        self._batch_start = time.monotonic()

    @staticmethod
    def _resolve_credentials(
        company_id: Optional[int], api_key: Optional[str]
    ) -> SummitCredentials:
        cid = company_id or os.environ.get("SUMMIT_COMPANY_ID", "").strip()
        key = api_key or os.environ.get("SUMMIT_API_KEY", "").strip()

        if not cid or not key:
            raise ValueError(
                "Summit API credentials required. Set SUMMIT_COMPANY_ID and SUMMIT_API_KEY env vars."
            )

        return SummitCredentials(
            company_id=int(cid),
            api_key=str(key),
        )

    def _rate_limit_pause(self):
        """Pause if we've hit the batch threshold."""
        self._call_count += 1
        if self._call_count % CALLS_PER_BATCH == 0:
            logger.info(
                "Rate limit pause after %d calls (cooling down %ds)",
                self._call_count, BATCH_COOLDOWN,
            )
            time.sleep(BATCH_COOLDOWN)
        else:
            time.sleep(DELAY_BETWEEN_CALLS)

    def _post(self, endpoint: str, body: Dict[str, Any]) -> Dict[str, Any]:
        """
        Make a single POST request to Summit API with retry on 403.
        """
        url = f"{BASE_URL}{endpoint}"
        request_body = {
            "Credentials": {
                "CompanyID": self.credentials.company_id,
                "APIKey": self.credentials.api_key,
            },
            **body,
        }

        backoff = INITIAL_BACKOFF
        for attempt in range(MAX_RETRIES + 1):
            self._rate_limit_pause()

            req = Request(
                url,
                data=json.dumps(request_body).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Content-Language": "he",
                },
            )

            try:
                with urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                    raw = json.loads(resp.read())
            except HTTPError as e:
                if e.code == 403 and attempt < MAX_RETRIES:
                    logger.warning(
                        "Summit 403 rate limit on attempt %d, backing off %ds",
                        attempt + 1, backoff,
                    )
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                raise SummitRateLimitError(
                    status=e.code,
                    user_message=f"Summit API returned {e.code}",
                    technical_details=str(e),
                ) if e.code == 403 else SummitAPIError(
                    status=e.code,
                    user_message=f"Summit API HTTP error {e.code}",
                    technical_details=str(e),
                )
            except URLError as e:
                raise SummitAPIError(
                    status=0,
                    user_message="Network error connecting to Summit API",
                    technical_details=str(e),
                )

            # Check Summit status wrapper
            if raw.get("Status") != 0:
                raise SummitAPIError(
                    status=raw.get("Status", -1),
                    user_message=raw.get("UserErrorMessage", ""),
                    technical_details=raw.get("TechnicalErrorDetails", ""),
                )

            return raw.get("Data", {})

        # Should not reach here but just in case
        raise SummitRateLimitError(
            status=403,
            user_message="Exhausted retries due to rate limiting",
        )

    # ── High-level methods ───────────────────────────────────────

    def list_entities(
        self,
        folder_id: str,
        page_size: int = 500,
        filters: Optional[List[Dict]] = None,
    ) -> List[int]:
        """
        List all entity IDs in a folder (auto-paginates).
        Returns list of entity IDs.
        """
        all_ids = []
        start_index = 0

        while True:
            body: Dict[str, Any] = {
                "Folder": folder_id,
                "Paging": {"StartIndex": start_index, "PageSize": page_size},
            }
            if filters:
                body["Filters"] = filters

            data = self._post("/crm/data/listentities/", body)
            entities = data.get("Entities", [])
            all_ids.extend(e["ID"] for e in entities)

            if not data.get("HasNextPage", False):
                break
            start_index += page_size

        logger.info("Listed %d entities in folder %s", len(all_ids), folder_id)
        return all_ids

    def get_entity(self, entity_id: int, folder_id: str) -> Dict[str, Any]:
        """
        Get full entity details by ID.
        Returns the Entity dict with all fields.
        Returns empty dict if entity is archived/empty.
        """
        try:
            data = self._post(
                "/crm/data/getentity/",
                {"EntityID": entity_id, "Folder": folder_id},
            )
        except SummitAPIError as e:
            # Empty/archived entities return business errors
            if e.status == 1:
                logger.debug("Entity %d is empty/archived, skipping", entity_id)
                return {}
            raise

        return data.get("Entity", {})

    def get_entities_batch(
        self,
        entity_ids: List[int],
        folder_id: str,
        progress_callback=None,
    ) -> List[Dict[str, Any]]:
        """
        Fetch full details for a list of entity IDs.
        Handles rate limiting automatically.
        Returns list of entity dicts (skips empty/archived).
        """
        results = []
        total = len(entity_ids)

        for i, eid in enumerate(entity_ids):
            entity = self.get_entity(eid, folder_id)
            if entity:
                results.append(entity)

            if progress_callback and (i + 1) % 50 == 0:
                progress_callback(i + 1, total)

        logger.info(
            "Fetched %d/%d entities from folder %s",
            len(results), total, folder_id,
        )
        return results

    def get_client_company_number(self, client_id: int) -> str:
        """
        Get Customers_CompanyNumber for a client entity.
        Returns the company number string, or empty string if not found.
        """
        entity = self.get_entity(client_id, "557688522")  # לקוחות folder
        if not entity:
            return ""

        cn = entity.get("Customers_CompanyNumber", [])
        if isinstance(cn, list) and cn:
            return str(cn[0]).strip()
        return str(cn).strip() if cn else ""

    def get_folder_schema(self, folder_id: str) -> Dict[str, Any]:
        """Get schema (field definitions) for a folder."""
        return self._post(
            "/crm/schema/getfolderschema/",
            {"Folder": folder_id, "IncludeProperties": True},
        )

    def update_entity(
        self,
        entity_id: int,
        folder_id: str,
        properties: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Update fields on an existing entity.
        Only changed fields need to be included in properties.
        Returns the updated entity dict.
        """
        logger.info("Updating entity %d in folder %s (%d fields)", entity_id, folder_id, len(properties))
        data = self._post(
            "/crm/data/updateentity/",
            {
                "Entity": {
                    "ID": entity_id,
                    "Folder": folder_id,
                    "Properties": properties,
                }
            },
        )
        return data.get("Entity", {})

    def create_entity(
        self,
        folder_id: str,
        properties: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a new entity in a folder.
        Returns the created entity dict (includes new ID).
        """
        logger.info("Creating entity in folder %s (%d fields)", folder_id, len(properties))
        data = self._post(
            "/crm/data/createentity/",
            {
                "Entity": {
                    "Folder": folder_id,
                    "Properties": properties,
                }
            },
        )
        return data.get("Entity", {})

    @property
    def call_count(self) -> int:
        """Total API calls made by this client instance."""
        return self._call_count
