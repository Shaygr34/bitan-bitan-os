# Summit Write-Back System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual XLSX import with direct Summit API writes — update existing report cards, create new ones for missing reports, and update client-level fields (פקיד שומה, סוג תיק) — all with dry-run safety, audit logging, and operator approval gates.

**Architecture:** New `sumit_writer.py` module handles all Summit API writes. The sync engine's `SyncResult` is extended with a `write_plan` — a list of planned operations (update/create/skip) with before/after values. A `write_executor.py` processes the plan in dry-run or live mode. The existing sync engine is modified to classify unmatched records as "create needed" (client exists, no report card) vs "exception" (client missing). Frontend gets a write-back approval page on the run detail view.

**Tech Stack:** Python 3.9 (FastAPI backend), Summit CRM API (`/crm/data/updateentity/`, `/crm/data/createentity/`), Next.js 14.2 (frontend), TypeScript, CSS Modules.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/sumit-sync/src/core/taxonomy.py` | **Create** | Taxonomy lookup tables (status, year, פקיד שומה, סוג תיק) — maps labels↔entity IDs |
| `apps/sumit-sync/src/core/write_plan.py` | **Create** | WritePlan dataclass: list of WriteOperation (update/create/update_client/skip) with before/after |
| `apps/sumit-sync/src/core/write_executor.py` | **Create** | Execute a WritePlan against Summit API (dry-run or live), returns WriteResult with audit log |
| `apps/sumit-sync/src/core/sumit_api_client.py` | **Modify** | Add `update_entity()` and `create_entity()` methods |
| `apps/sumit-sync/src/core/sync_engine.py` | **Modify** | Extend to classify unmatched records + build WritePlan |
| `apps/sumit-sync/src/api/routes.py` | **Modify** | Add `/runs/{id}/write-plan` (GET), `/runs/{id}/write-back` (POST), `/runs/{id}/write-back/dry-run` (POST) |
| `apps/sumit-sync/src/api/schemas.py` | **Modify** | Add Pydantic models for write plan/result |
| `apps/sumit-sync/src/db/models.py` | **Modify** | Add `WriteLog` model for audit trail |
| `apps/sumit-sync/tests/test_write_plan.py` | **Create** | Tests for write plan generation |
| `apps/sumit-sync/tests/test_taxonomy.py` | **Create** | Tests for taxonomy lookups |
| `apps/os-hub/src/app/api/sumit-sync/runs/[id]/write-plan/route.ts` | **Create** | Proxy route |
| `apps/os-hub/src/app/api/sumit-sync/runs/[id]/write-back/route.ts` | **Create** | Proxy route |
| `apps/os-hub/src/app/sumit-sync/runs/[id]/page.tsx` | **Modify** | Add write plan viewer + approval UI |
| `apps/os-hub/src/app/sumit-sync/runs/[id]/page.module.css` | **Modify** | Styles for write plan section |

---

## Chunk 1: Taxonomy + API Client Extensions

### Task 1: Create taxonomy lookup module

**Files:**
- Create: `apps/sumit-sync/src/core/taxonomy.py`
- Create: `apps/sumit-sync/tests/test_taxonomy.py`

The taxonomy module provides bidirectional mappings between IDOM field values and Summit entity reference IDs. All data is hardcoded from the live Summit API (queried April 13, 2026).

- [ ] **Step 1: Write taxonomy tests**

```python
# tests/test_taxonomy.py
"""Tests for Summit taxonomy lookups."""
import pytest
from src.core.taxonomy import (
    resolve_tax_year,
    resolve_status,
    resolve_pkid_shoma,
    resolve_sug_tik,
    STATUS_COMPLETED_ID,
    STATUS_PRE_WORK_ID,
)


def test_resolve_tax_year_2024():
    assert resolve_tax_year(2024) == 1125575564


def test_resolve_tax_year_2025():
    assert resolve_tax_year(2025) == 1125583827


def test_resolve_tax_year_unknown():
    assert resolve_tax_year(2019) is None


def test_resolve_status_completed():
    assert resolve_status(has_submission=True) == STATUS_COMPLETED_ID


def test_resolve_status_no_submission():
    assert resolve_status(has_submission=False) == STATUS_PRE_WORK_ID


def test_resolve_pkid_shoma_by_code():
    # "תל אביב 3 - 38" → code 38
    result = resolve_pkid_shoma("38")
    assert result is not None
    assert result["id"] == 1099384290


def test_resolve_pkid_shoma_unknown():
    assert resolve_pkid_shoma("999") is None


def test_resolve_sug_tik():
    result = resolve_sug_tik("7")
    assert result is not None
    assert result["id"] == 1099349748


def test_resolve_sug_tik_unknown():
    assert resolve_sug_tik("999") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shay/bitan-bitan-os/apps/sumit-sync && source .venv/bin/activate && python -m pytest tests/test_taxonomy.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement taxonomy module**

```python
# src/core/taxonomy.py
"""
Summit CRM taxonomy lookups.

Maps IDOM field values → Summit entity reference IDs.
Data sourced from live Summit API on April 13, 2026.

To refresh: query each folder via summit_list_entities + summit_get_entity.
"""
from typing import Dict, Optional
import re
import logging

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

# ── פקיד שומה (Tax Assessor) — folder 1081741878, 33 entries ──
# Format: "city - code" where code matches IDOM פ.ש field
# We store the full list; matching is by trailing code number
PKID_SHOMA: list = [
    {"id": 1099384287, "label": "רחובות - 26", "code": "26"},
    {"id": 1099384289, "label": "ירושלים 2 - 45", "code": "45"},
    {"id": 1099384290, "label": "תל אביב 3 - 38", "code": "38"},
    {"id": 1099384291, "label": "לא מייצג תיק", "code": ""},
    {"id": 1099384292, "label": "תל אביב 4 - 34", "code": "34"},
    {"id": 1099384296, "label": "אשקלון - 51", "code": "51"},
    # NOTE: remaining 27 entries need to be fetched and added
    # during first production run. See _load_remaining_pkid_shoma().
]
# Index by code for fast lookup
_PKID_SHOMA_BY_CODE: Dict[str, dict] = {}

# ── סוג תיק (File Type) — folder 1081741713, 25 entries ──
# Numeric codes matching IDOM סוג_תיק field
SUG_TIK: list = [
    {"id": 1099349748, "label": "7", "code": "7"},
    {"id": 1099349795, "label": "10", "code": "10"},
    {"id": 1099350031, "label": "9", "code": "9"},
    {"id": 1099350048, "label": "21", "code": "21"},
    {"id": 1099350811, "label": "14", "code": "14"},
    {"id": 1099350822, "label": "20", "code": "20"},
    # NOTE: remaining 19 entries need to be fetched and added
    # during first production run. See _load_remaining_sug_tik().
]
_SUG_TIK_BY_CODE: Dict[str, dict] = {}


def _build_indexes():
    """Build lookup indexes from lists."""
    global _PKID_SHOMA_BY_CODE, _SUG_TIK_BY_CODE
    _PKID_SHOMA_BY_CODE = {e["code"]: e for e in PKID_SHOMA if e["code"]}
    _SUG_TIK_BY_CODE = {e["code"]: e for e in SUG_TIK if e["code"]}


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
    return STATUSES.get(entity_id, f"Unknown ({entity_id})")


def load_full_taxonomies(api_client) -> None:
    """
    Fetch all taxonomy entries from Summit API and update local tables.
    Call this once during first production run to fill incomplete tables.
    """
    global PKID_SHOMA, SUG_TIK

    # Load פקיד שומה
    ids = api_client.list_entities("1081741878")
    existing_ids = {e["id"] for e in PKID_SHOMA}
    for eid in ids:
        if eid not in existing_ids:
            entity = api_client.get_entity(eid, "1081741878")
            if entity:
                label = ""
                raw = entity.get("פקיד שומה", [])
                if isinstance(raw, list) and raw:
                    label = str(raw[0])
                code_match = re.search(r'(\d+)\s*$', label)
                code = code_match.group(1) if code_match else ""
                PKID_SHOMA.append({"id": eid, "label": label, "code": code})

    # Load סוג תיק
    ids = api_client.list_entities("1081741713")
    existing_ids = {e["id"] for e in SUG_TIK}
    for eid in ids:
        if eid not in existing_ids:
            entity = api_client.get_entity(eid, "1081741713")
            if entity:
                label = ""
                raw = entity.get("סוג תיק", [])
                if isinstance(raw, list) and raw:
                    label = str(raw[0])
                SUG_TIK.append({"id": eid, "label": label, "code": label.strip()})

    _build_indexes()
    logger.info(
        "Loaded taxonomies: %d פקיד שומה, %d סוג תיק",
        len(PKID_SHOMA), len(SUG_TIK),
    )
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_taxonomy.py -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/sumit-sync/src/core/taxonomy.py apps/sumit-sync/tests/test_taxonomy.py
git commit -m "feat(sumit-sync): add taxonomy lookup module for Summit entity references"
```

---

### Task 2: Add update_entity and create_entity to API client

**Files:**
- Modify: `apps/sumit-sync/src/core/sumit_api_client.py`

- [ ] **Step 1: Add update_entity method**

Add after `get_folder_schema()` method (after line 271):

```python
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
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `python -m pytest tests/ -v`
Expected: 29 pass (+ taxonomy tests)

- [ ] **Step 3: Commit**

```bash
git add apps/sumit-sync/src/core/sumit_api_client.py
git commit -m "feat(sumit-sync): add update_entity and create_entity to Summit API client"
```

---

## Chunk 2: Write Plan + Executor

### Task 3: Create WritePlan data model

**Files:**
- Create: `apps/sumit-sync/src/core/write_plan.py`
- Create: `apps/sumit-sync/tests/test_write_plan.py`

- [ ] **Step 1: Write tests for WritePlan**

```python
# tests/test_write_plan.py
"""Tests for write plan data model."""
import pytest
from src.core.write_plan import WritePlan, WriteOperation, OpType


def test_empty_plan():
    plan = WritePlan()
    assert plan.total == 0
    assert plan.updates == 0
    assert plan.creates == 0


def test_add_update():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_REPORT,
        entity_id=12345,
        folder_id="1124761700",
        client_name="כהן יעקב",
        match_key="123456789",
        properties={"תאריך הגשה": "15/03/2025"},
        old_values={"תאריך הגשה": ""},
        reason="IDOM has submission date",
    ))
    assert plan.total == 1
    assert plan.updates == 1
    assert plan.creates == 0


def test_add_create():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.CREATE_REPORT,
        entity_id=None,
        folder_id="1144157121",
        client_name="לוי שרה",
        match_key="987654321",
        client_entity_id=99999,
        properties={"לקוח": 99999, "שנת מס": 1125575564},
        old_values={},
        reason="New report card — client exists, no report for 2024",
    ))
    assert plan.total == 1
    assert plan.creates == 1


def test_add_client_update():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_CLIENT,
        entity_id=99999,
        folder_id="557688522",
        client_name="כהן יעקב",
        match_key="123456789",
        properties={"פקיד שומה": 1099384290},
        old_values={"פקיד שומה": ""},
        reason="IDOM has פ.ש code 38",
    ))
    assert plan.total == 1
    assert plan.client_updates == 1


def test_plan_summary():
    plan = WritePlan()
    plan.add(WriteOperation(
        op_type=OpType.UPDATE_REPORT, entity_id=1, folder_id="f",
        client_name="a", match_key="1", properties={}, old_values={}, reason="",
    ))
    plan.add(WriteOperation(
        op_type=OpType.CREATE_REPORT, entity_id=None, folder_id="f",
        client_name="b", match_key="2", properties={}, old_values={}, reason="",
    ))
    plan.add(WriteOperation(
        op_type=OpType.SKIP, entity_id=3, folder_id="f",
        client_name="c", match_key="3", properties={}, old_values={}, reason="no changes",
    ))
    summary = plan.summary()
    assert summary["total"] == 3
    assert summary["updates"] == 1
    assert summary["creates"] == 1
    assert summary["skips"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_write_plan.py -v`
Expected: FAIL

- [ ] **Step 3: Implement WritePlan**

```python
# src/core/write_plan.py
"""
Write plan data model for Summit API write-back.

A WritePlan is a list of WriteOperations generated by the sync engine.
Each operation describes what should be written to Summit (or skipped).
The plan can be reviewed before execution (dry-run mode).
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import json
import logging

logger = logging.getLogger(__name__)


class OpType(Enum):
    UPDATE_REPORT = "update_report"
    CREATE_REPORT = "create_report"
    UPDATE_CLIENT = "update_client"
    SKIP = "skip"
    FLAG = "flag"  # needs human attention


@dataclass
class WriteOperation:
    """Single write operation in the plan."""
    op_type: OpType
    entity_id: Optional[int]       # None for creates
    folder_id: str
    client_name: str
    match_key: str                 # ח.פ / ת"ז
    properties: Dict[str, Any]     # what to write
    old_values: Dict[str, Any]     # current values (for audit)
    reason: str
    client_entity_id: Optional[int] = None  # for creates — link to client

    def to_dict(self) -> Dict[str, Any]:
        return {
            "op_type": self.op_type.value,
            "entity_id": self.entity_id,
            "folder_id": self.folder_id,
            "client_name": self.client_name,
            "match_key": self.match_key,
            "properties": self.properties,
            "old_values": self.old_values,
            "reason": self.reason,
            "client_entity_id": self.client_entity_id,
        }


@dataclass
class WritePlan:
    """Collection of write operations with summary stats."""
    operations: List[WriteOperation] = field(default_factory=list)

    def add(self, op: WriteOperation):
        self.operations.append(op)

    @property
    def total(self) -> int:
        return len(self.operations)

    @property
    def updates(self) -> int:
        return sum(1 for o in self.operations if o.op_type == OpType.UPDATE_REPORT)

    @property
    def creates(self) -> int:
        return sum(1 for o in self.operations if o.op_type == OpType.CREATE_REPORT)

    @property
    def client_updates(self) -> int:
        return sum(1 for o in self.operations if o.op_type == OpType.UPDATE_CLIENT)

    @property
    def skips(self) -> int:
        return sum(1 for o in self.operations if o.op_type == OpType.SKIP)

    @property
    def flags(self) -> int:
        return sum(1 for o in self.operations if o.op_type == OpType.FLAG)

    def summary(self) -> Dict[str, int]:
        return {
            "total": self.total,
            "updates": self.updates,
            "creates": self.creates,
            "client_updates": self.client_updates,
            "skips": self.skips,
            "flags": self.flags,
        }

    def to_json(self) -> str:
        return json.dumps(
            {"summary": self.summary(), "operations": [o.to_dict() for o in self.operations]},
            ensure_ascii=False,
            indent=2,
        )


@dataclass
class WriteResult:
    """Result of executing a WritePlan."""
    dry_run: bool
    total_attempted: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    errors: List[Dict[str, str]] = field(default_factory=list)
    audit_log: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dry_run": self.dry_run,
            "total_attempted": self.total_attempted,
            "succeeded": self.succeeded,
            "failed": self.failed,
            "skipped": self.skipped,
            "errors": self.errors,
            "audit_log": self.audit_log,
        }
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_write_plan.py -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/sumit-sync/src/core/write_plan.py apps/sumit-sync/tests/test_write_plan.py
git commit -m "feat(sumit-sync): add WritePlan data model for write-back operations"
```

---

### Task 4: Create write executor

**Files:**
- Create: `apps/sumit-sync/src/core/write_executor.py`

- [ ] **Step 1: Implement write executor**

```python
# src/core/write_executor.py
"""
Execute a WritePlan against the Summit API.

Supports dry-run mode (validates + logs without writing)
and live mode (actually writes to Summit).

Every operation is logged with before/after values for audit.
"""
import time
import logging
from datetime import datetime, timezone
from typing import Optional

from .sumit_api_client import SummitAPIClient, SummitAPIError
from .write_plan import WritePlan, WriteOperation, WriteResult, OpType

logger = logging.getLogger(__name__)


class WriteExecutor:
    """
    Executes a WritePlan against Summit CRM.

    In dry_run mode: validates operations, builds audit log, but makes no API calls.
    In live mode: calls update_entity/create_entity for each operation.
    """

    def __init__(self, client: Optional[SummitAPIClient] = None, dry_run: bool = True):
        self.client = client or SummitAPIClient()
        self.dry_run = dry_run

    def execute(self, plan: WritePlan, progress_callback=None) -> WriteResult:
        """Execute all operations in the plan."""
        result = WriteResult(dry_run=self.dry_run)
        total = plan.total

        for i, op in enumerate(plan.operations):
            if op.op_type == OpType.SKIP:
                result.skipped += 1
                result.audit_log.append(self._audit_entry(op, "skipped", None))
                continue

            if op.op_type == OpType.FLAG:
                result.skipped += 1
                result.audit_log.append(self._audit_entry(op, "flagged", None))
                continue

            result.total_attempted += 1

            try:
                if self.dry_run:
                    # Dry run — validate but don't write
                    self._validate_operation(op)
                    result.succeeded += 1
                    result.audit_log.append(self._audit_entry(op, "dry_run_ok", None))
                else:
                    # Live — execute the write
                    api_result = self._execute_single(op)
                    result.succeeded += 1
                    result.audit_log.append(self._audit_entry(op, "success", api_result))
            except (SummitAPIError, ValueError) as e:
                result.failed += 1
                error_info = {
                    "match_key": op.match_key,
                    "client_name": op.client_name,
                    "op_type": op.op_type.value,
                    "error": str(e),
                }
                result.errors.append(error_info)
                result.audit_log.append(self._audit_entry(op, "failed", None, str(e)))
                logger.error(
                    "Write failed for %s (%s): %s",
                    op.match_key, op.op_type.value, e,
                )

            if progress_callback and (i + 1) % 10 == 0:
                progress_callback(i + 1, total)

        logger.info(
            "Write execution complete (dry_run=%s): %d attempted, %d succeeded, %d failed, %d skipped",
            self.dry_run, result.total_attempted, result.succeeded, result.failed, result.skipped,
        )
        return result

    def _execute_single(self, op: WriteOperation):
        """Execute a single write operation against Summit API."""
        if op.op_type == OpType.UPDATE_REPORT:
            return self.client.update_entity(op.entity_id, op.folder_id, op.properties)
        elif op.op_type == OpType.CREATE_REPORT:
            return self.client.create_entity(op.folder_id, op.properties)
        elif op.op_type == OpType.UPDATE_CLIENT:
            return self.client.update_entity(op.entity_id, op.folder_id, op.properties)
        else:
            raise ValueError(f"Unexpected op_type for execution: {op.op_type}")

    def _validate_operation(self, op: WriteOperation):
        """Validate an operation without executing it."""
        if op.op_type in (OpType.UPDATE_REPORT, OpType.UPDATE_CLIENT):
            if not op.entity_id:
                raise ValueError(f"Missing entity_id for {op.op_type.value}")
        if not op.folder_id:
            raise ValueError("Missing folder_id")
        if not op.properties:
            raise ValueError("Empty properties — nothing to write")

    def _audit_entry(self, op: WriteOperation, status: str, api_result, error: str = "") -> dict:
        """Build an audit log entry."""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "op_type": op.op_type.value,
            "entity_id": op.entity_id,
            "folder_id": op.folder_id,
            "match_key": op.match_key,
            "client_name": op.client_name,
            "properties_written": op.properties,
            "old_values": op.old_values,
            "status": status,
            "error": error,
        }
```

- [ ] **Step 2: Run all tests**

Run: `python -m pytest tests/ -v`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/sumit-sync/src/core/write_executor.py
git commit -m "feat(sumit-sync): add write executor with dry-run and live modes"
```

---

## Chunk 3: Sync Engine Extensions

### Task 5: Extend sync engine to build WritePlan

**Files:**
- Modify: `apps/sumit-sync/src/core/sync_engine.py`

The sync engine needs two new capabilities:
1. Classify unmatched records: "create needed" (client exists) vs "exception" (client missing)
2. Build a `WritePlan` from sync results + IDOM data

- [ ] **Step 1: Add write plan builder to SyncEngine**

Add these imports at top of `sync_engine.py`:

```python
from .write_plan import WritePlan, WriteOperation, OpType
from .taxonomy import resolve_tax_year, resolve_status, resolve_pkid_shoma, resolve_sug_tik, STATUS_COMPLETED_ID
```

Add the `build_write_plan` method to the `SyncEngine` class (after the `sync` method):

```python
def build_write_plan(
    self,
    idom_df: pd.DataFrame,
    sumit_df: pd.DataFrame,
    sumit_lookup: Dict[str, pd.Series],
    tax_year: int,
    client_mapping=None,
) -> WritePlan:
    """
    Build a WritePlan from IDOM data and Summit state.

    For each IDOM record:
    - Matched + changes needed → UPDATE_REPORT
    - Matched + no changes → SKIP
    - Unmatched + client exists → CREATE_REPORT
    - Unmatched + client missing → FLAG
    Also builds UPDATE_CLIENT ops for פקיד שומה / סוג תיק.

    Args:
        idom_df: Parsed IDOM DataFrame
        sumit_df: Parsed SUMIT DataFrame
        sumit_lookup: Lookup dict from match key to SUMIT record
        tax_year: Tax year being processed
        client_mapping: MappingStore instance (for client ID lookups)
    """
    plan = WritePlan()
    folder_id = {
        "financial": "1124761700",
        "annual": "1144157121",
    }[self.config.report_type.value]

    year_entity_id = resolve_tax_year(tax_year)

    # Track which clients we've already planned client-level updates for
    client_updates_planned = set()

    for _, idom_row in idom_df.iterrows():
        match_key = str(idom_row.get("מספר_תיק", ""))
        client_name = str(idom_row.get("שם", ""))
        has_submission = pd.notna(idom_row.get("תאריך_הגשה"))

        # Try to find matching SUMIT record
        sumit_row = sumit_lookup.get(match_key)
        if sumit_row is None and match_key:
            normalized = match_key.lstrip("0")
            if normalized != match_key:
                for sk in sumit_lookup:
                    if sk.lstrip("0") == normalized:
                        sumit_row = sumit_lookup[sk]
                        break

        if sumit_row is not None:
            # ── MATCHED: build update operation ──
            entity_id = sumit_row.get("מזהה", "")
            if str(entity_id).endswith(".0"):
                entity_id = str(entity_id)[:-2]
            entity_id = int(entity_id) if entity_id else None

            properties = {}
            old_values = {}

            # Status
            status_id = resolve_status(has_submission)
            current_status = str(sumit_row.get("סטטוס", ""))
            if has_submission and str(STATUS_COMPLETED_ID) not in current_status:
                properties["סטטוס"] = status_id
                old_values["סטטוס"] = current_status

            # Extension date (אורכה מ"ה from IDOM)
            idom_ext = idom_row.get("תאריך_ארכה")
            if pd.notna(idom_ext):
                ext_str = idom_ext.strftime("%d/%m/%Y") if hasattr(idom_ext, "strftime") else str(idom_ext)
                old_ext = sumit_row.get('תאריך אורכה מ"ה', "")
                properties['תאריך אורכה מ"ה'] = ext_str
                old_values['תאריך אורכה מ"ה'] = str(old_ext) if pd.notna(old_ext) else ""

            # Submission date
            idom_sub = idom_row.get("תאריך_הגשה")
            if pd.notna(idom_sub):
                sub_str = idom_sub.strftime("%d/%m/%Y") if hasattr(idom_sub, "strftime") else str(idom_sub)
                old_sub = sumit_row.get("תאריך הגשה", "")
                properties["תאריך הגשה"] = sub_str
                old_values["תאריך הגשה"] = str(old_sub) if pd.notna(old_sub) else ""

            if properties:
                plan.add(WriteOperation(
                    op_type=OpType.UPDATE_REPORT,
                    entity_id=entity_id,
                    folder_id=folder_id,
                    client_name=client_name,
                    match_key=match_key,
                    properties=properties,
                    old_values=old_values,
                    reason="Matched — updating from IDOM",
                ))
            else:
                plan.add(WriteOperation(
                    op_type=OpType.SKIP,
                    entity_id=entity_id,
                    folder_id=folder_id,
                    client_name=client_name,
                    match_key=match_key,
                    properties={},
                    old_values={},
                    reason="Matched — no changes needed",
                ))
        else:
            # ── UNMATCHED: check if client exists ──
            client_id = None
            if client_mapping:
                client_id_str = client_mapping.get_client_id(match_key)
                if client_id_str:
                    client_id = int(client_id_str)

            if client_id:
                # Client exists → CREATE new report card
                properties = {
                    "לקוח": client_id,
                }
                if year_entity_id:
                    properties["שנת מס"] = year_entity_id
                properties["סטטוס"] = resolve_status(has_submission)

                idom_ext = idom_row.get("תאריך_ארכה")
                if pd.notna(idom_ext):
                    ext_str = idom_ext.strftime("%d/%m/%Y") if hasattr(idom_ext, "strftime") else str(idom_ext)
                    properties['תאריך אורכה מ"ה'] = ext_str

                idom_sub = idom_row.get("תאריך_הגשה")
                if pd.notna(idom_sub):
                    sub_str = idom_sub.strftime("%d/%m/%Y") if hasattr(idom_sub, "strftime") else str(idom_sub)
                    properties["תאריך הגשה"] = sub_str

                plan.add(WriteOperation(
                    op_type=OpType.CREATE_REPORT,
                    entity_id=None,
                    folder_id=folder_id,
                    client_name=client_name,
                    match_key=match_key,
                    client_entity_id=client_id,
                    properties=properties,
                    old_values={},
                    reason=f"New report — client exists (ID {client_id}), no report for {tax_year}",
                ))
            else:
                # Client doesn't exist → FLAG
                plan.add(WriteOperation(
                    op_type=OpType.FLAG,
                    entity_id=None,
                    folder_id=folder_id,
                    client_name=client_name,
                    match_key=match_key,
                    properties={},
                    old_values={},
                    reason="Client not found in Summit — needs manual review",
                ))

        # ── CLIENT-LEVEL UPDATES (פקיד שומה, סוג תיק) ──
        if match_key and match_key not in client_updates_planned:
            client_id = None
            if client_mapping:
                cid_str = client_mapping.get_client_id(match_key)
                if cid_str:
                    client_id = int(cid_str)

            if client_id:
                client_props = {}
                client_old = {}

                # פקיד שומה
                ps_code = str(idom_row.get("פקיד_שומה", "")).strip()
                if ps_code:
                    ps = resolve_pkid_shoma(ps_code)
                    if ps:
                        client_props["פקיד שומה"] = ps["id"]
                        client_old["פקיד שומה"] = ""  # we don't fetch old value here

                # סוג תיק
                st_code = str(idom_row.get("סוג_תיק", "")).strip()
                if st_code:
                    st = resolve_sug_tik(st_code)
                    if st:
                        client_props["סוג תיק"] = st["id"]
                        client_old["סוג תיק"] = ""

                if client_props:
                    plan.add(WriteOperation(
                        op_type=OpType.UPDATE_CLIENT,
                        entity_id=client_id,
                        folder_id="557688522",
                        client_name=client_name,
                        match_key=match_key,
                        properties=client_props,
                        old_values=client_old,
                        reason="Client-level fields from IDOM",
                    ))
                    client_updates_planned.add(match_key)

    logger.info(
        "Write plan built: %d total (%d updates, %d creates, %d client updates, %d skips, %d flags)",
        plan.total, plan.updates, plan.creates, plan.client_updates, plan.skips, plan.flags,
    )
    return plan
```

- [ ] **Step 2: Run all tests**

Run: `python -m pytest tests/ -v`
Expected: All pass (existing tests don't call build_write_plan)

- [ ] **Step 3: Commit**

```bash
git add apps/sumit-sync/src/core/sync_engine.py
git commit -m "feat(sumit-sync): extend sync engine with write plan builder"
```

---

## Chunk 4: API Routes + DB Model

### Task 6: Add WriteLog DB model

**Files:**
- Modify: `apps/sumit-sync/src/db/models.py`

- [ ] **Step 1: Add WriteLog model**

Add after the `Exception` class:

```python
class WriteLog(Base):
    """
    Audit trail for Summit API write operations.
    Every update/create is logged with before/after values.
    """
    __tablename__ = "write_logs"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    run_id = Column(Uuid, ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    op_type = Column(String(20), nullable=False)  # update_report, create_report, update_client
    entity_id = Column(Integer, nullable=True)     # null for creates
    folder_id = Column(String(20), nullable=False)
    match_key = Column(String(50), nullable=True)
    client_name = Column(String(255), nullable=True)
    properties_written = Column(JSON, nullable=True)
    old_values = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False)    # success, failed, dry_run_ok, skipped
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    run = relationship("Run", backref="write_logs")
```

Also add `"write_plan"` to the `valid_file_role` check constraint on `RunFile` (or remove the constraint since it's getting too many values).

- [ ] **Step 2: Run tests**

Run: `python -m pytest tests/ -v`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/sumit-sync/src/db/models.py
git commit -m "feat(sumit-sync): add WriteLog audit model"
```

---

### Task 7: Add write-back API routes

**Files:**
- Modify: `apps/sumit-sync/src/api/routes.py`
- Modify: `apps/sumit-sync/src/api/schemas.py`

- [ ] **Step 1: Add Pydantic schemas**

Add to `schemas.py`:

```python
class WriteOperationOut(BaseModel):
    op_type: str
    entity_id: Optional[int]
    folder_id: str
    client_name: str
    match_key: str
    properties: Dict[str, Any]
    old_values: Dict[str, Any]
    reason: str
    client_entity_id: Optional[int] = None

class WritePlanOut(BaseModel):
    summary: Dict[str, int]
    operations: List[WriteOperationOut]

class WriteResultOut(BaseModel):
    dry_run: bool
    total_attempted: int
    succeeded: int
    failed: int
    skipped: int
    errors: List[Dict[str, str]]
```

- [ ] **Step 2: Add routes to routes.py**

Add three new endpoints:

```python
# GET /runs/{id}/write-plan — generate and return the write plan
@router.get("/{run_id}/write-plan")
def get_write_plan(run_id: str, db: Session = Depends(get_db)):
    """Generate write plan for a completed sync run."""
    run = _run_or_404(run_id, db)
    if run.status not in ("review", "completed"):
        raise HTTPException(400, "Write plan requires a completed sync run")

    # Get IDOM file
    files_by_role = {f.file_role: f for f in run.files}
    if "idom_upload" not in files_by_role:
        raise HTTPException(400, "IDOM file not found")

    from ..core.config import get_config
    from ..core.idom_parser import parse_idom_file
    from ..core.sumit_api_source import fetch_sumit_data
    from ..core.sync_engine import SyncEngine
    from ..core.mapping_store import MappingStore

    config = get_config(run.report_type)
    idom_df, _, _ = parse_idom_file(files_by_role["idom_upload"].stored_path)
    sumit_df, sumit_lookup, _ = fetch_sumit_data(config, run.year)
    mapping = MappingStore()

    engine = SyncEngine(config)
    plan = engine.build_write_plan(idom_df, sumit_df, sumit_lookup, run.year, mapping)

    return {
        "summary": plan.summary(),
        "operations": [op.to_dict() for op in plan.operations],
    }


# POST /runs/{id}/write-back/dry-run — execute in dry-run mode
@router.post("/{run_id}/write-back/dry-run")
def write_back_dry_run(run_id: str, db: Session = Depends(get_db)):
    """Execute write plan in dry-run mode (no actual writes)."""
    run = _run_or_404(run_id, db)
    if run.status not in ("review", "completed"):
        raise HTTPException(400, "Write-back requires a completed sync run")

    plan = _build_write_plan_for_run(run, db)

    from ..core.write_executor import WriteExecutor
    executor = WriteExecutor(dry_run=True)
    result = executor.execute(plan)

    # Save audit log
    _save_write_logs(run.id, result.audit_log, db)

    return result.to_dict()


# POST /runs/{id}/write-back — execute LIVE (requires explicit confirmation)
@router.post("/{run_id}/write-back")
def write_back_live(run_id: str, db: Session = Depends(get_db)):
    """Execute write plan LIVE — writes to Summit CRM."""
    run = _run_or_404(run_id, db)
    if run.status not in ("review", "completed"):
        raise HTTPException(400, "Write-back requires a completed sync run")

    plan = _build_write_plan_for_run(run, db)

    from ..core.write_executor import WriteExecutor
    executor = WriteExecutor(dry_run=False)
    result = executor.execute(plan)

    _save_write_logs(run.id, result.audit_log, db)

    return result.to_dict()


def _build_write_plan_for_run(run, db):
    """Helper: build write plan from a run's data."""
    files_by_role = {f.file_role: f for f in run.files}
    if "idom_upload" not in files_by_role:
        raise HTTPException(400, "IDOM file not found")

    from ..core.config import get_config
    from ..core.idom_parser import parse_idom_file
    from ..core.sumit_api_source import fetch_sumit_data
    from ..core.sync_engine import SyncEngine
    from ..core.mapping_store import MappingStore

    config = get_config(run.report_type)
    idom_df, _, _ = parse_idom_file(files_by_role["idom_upload"].stored_path)
    sumit_df, sumit_lookup, _ = fetch_sumit_data(config, run.year)
    mapping = MappingStore()

    engine = SyncEngine(config)
    return engine.build_write_plan(idom_df, sumit_df, sumit_lookup, run.year, mapping)


def _save_write_logs(run_id, audit_log, db):
    """Persist audit log entries to DB."""
    from ..db.models import WriteLog
    for entry in audit_log:
        log = WriteLog(
            run_id=run_id,
            op_type=entry.get("op_type", ""),
            entity_id=entry.get("entity_id"),
            folder_id=entry.get("folder_id", ""),
            match_key=entry.get("match_key", ""),
            client_name=entry.get("client_name", ""),
            properties_written=entry.get("properties_written"),
            old_values=entry.get("old_values"),
            status=entry.get("status", ""),
            error_message=entry.get("error", ""),
        )
        db.add(log)
    db.commit()
```

- [ ] **Step 3: Run all tests**

Run: `python -m pytest tests/ -v`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/sumit-sync/src/api/routes.py apps/sumit-sync/src/api/schemas.py
git commit -m "feat(sumit-sync): add write-plan and write-back API routes"
```

---

## Chunk 5: Frontend — Write Plan Viewer + Approval

### Task 8: Add proxy routes for write-back

**Files:**
- Create: `apps/os-hub/src/app/api/sumit-sync/runs/[id]/write-plan/route.ts`
- Create: `apps/os-hub/src/app/api/sumit-sync/runs/[id]/write-back/route.ts`

- [ ] **Step 1: Create write-plan proxy**

```typescript
// write-plan/route.ts
import { NextResponse } from "next/server";
import { BASE_URL } from "../../../../proxy";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const url = `${BASE_URL}/runs/${id}/write-plan`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(900_000) });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: "שירות לא זמין", detail: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create write-back proxy (dry-run + live)**

```typescript
// write-back/route.ts
import { NextRequest, NextResponse } from "next/server";
import { BASE_URL } from "../../../../proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "dry-run";
  const endpoint = mode === "live" ? "write-back" : "write-back/dry-run";

  try {
    const url = `${BASE_URL}/runs/${id}/${endpoint}`;
    console.log(`[sumit-sync proxy] POST ${url}`);
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(900_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: "שירות לא זמין", detail: String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/os-hub/src/app/api/sumit-sync/runs/[id]/write-plan/route.ts" \
        "apps/os-hub/src/app/api/sumit-sync/runs/[id]/write-back/route.ts"
git commit -m "feat(sumit-sync): add write-plan and write-back proxy routes"
```

---

### Task 9: Add write plan UI to run detail page

**Files:**
- Modify: `apps/os-hub/src/app/sumit-sync/runs/[id]/page.tsx`
- Modify: `apps/os-hub/src/app/sumit-sync/runs/[id]/page.module.css`

Add a "Write to Summit" section on the run detail page that:
1. Loads the write plan on demand
2. Shows summary (N updates, N creates, N skips, N flags)
3. Shows operation table with before/after values
4. Has "Dry Run" and "Execute Live" buttons
5. Shows execution results

This is a large UI component. Add it as a `WritePlanSection` component at the bottom of `page.tsx`, placed between the exceptions section and the confirm dialogs.

- [ ] **Step 1: Add CSS for write plan section**

Add to `page.module.css`:
- `.writePlanSection` — container
- `.planSummary` — summary cards row
- `.planSummaryCard` — individual card
- `.planOpsTable` — operations table (reuse `.exceptionsTable` style pattern)
- `.opUpdate`, `.opCreate`, `.opSkip`, `.opFlag` — color-coded row styles
- `.writeBtnGroup` — dry-run/live button group
- `.writeResultBanner` — success/failure banner after execution

- [ ] **Step 2: Add WritePlanSection component**

The component:
- "Load Write Plan" button → fetches `/api/sumit-sync/runs/{id}/write-plan`
- Displays summary cards
- Displays operations table with op_type, client name, match key, properties (old→new), reason
- "Dry Run" button → POST `/api/sumit-sync/runs/{id}/write-back?mode=dry-run`
- After successful dry run: "Execute Live" button appears (requires confirmation dialog)
- "Execute Live" → POST `/api/sumit-sync/runs/{id}/write-back?mode=live`

- [ ] **Step 3: Build check**

Run: `cd /Users/shay/bitan-bitan-os/apps/os-hub && npx next build`
Expected: Build passes

- [ ] **Step 4: Commit**

```bash
git add "apps/os-hub/src/app/sumit-sync/runs/[id]/page.tsx" \
        "apps/os-hub/src/app/sumit-sync/runs/[id]/page.module.css"
git commit -m "feat(sumit-sync): add write plan viewer and approval UI"
```

---

## Chunk 6: Integration Test + Deploy

### Task 10: End-to-end testing

- [ ] **Step 1: Run Python tests**

Run: `cd /Users/shay/bitan-bitan-os/apps/sumit-sync && python -m pytest tests/ -v`
Expected: All pass

- [ ] **Step 2: Build Next.js**

Run: `cd /Users/shay/bitan-bitan-os/apps/os-hub && npx next build`
Expected: Build passes

- [ ] **Step 3: Push and verify Railway deploy**

```bash
git push origin main
```

- [ ] **Step 4: Verify production endpoints**

```bash
curl -s -o /dev/null -w "%{http_code}" https://bitan-bitan-os-production.up.railway.app/sumit-sync/new
```
Expected: 200

### Task 11: Update CLAUDE.md

- [ ] **Step 1: Add write-back documentation to CLAUDE.md**

Document the new write-back capability, API routes, safety model, and taxonomy module.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add write-back system documentation to CLAUDE.md"
```
