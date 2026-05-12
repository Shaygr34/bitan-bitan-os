"""
Execute a WritePlan against the Summit API.

Supports dry-run mode (validates + logs without writing)
and live mode (actually writes to Summit).

Every operation is logged with before/after values for audit.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from . import taxonomy
from .sumit_api_client import SummitAPIClient, SummitAPIError
from .write_plan import WritePlan, WriteOperation, WriteResult, OpType

logger = logging.getLogger(__name__)

# Folders the engine is allowed to write to. Anything else = bug.
ALLOWED_FOLDERS = {
    "557688522",   # לקוחות (UPDATE_CLIENT: פקיד שומה / סוג תיק)
    "1124761700",  # דוחות כספיים (חברות)
    "1144157121",  # דוחות שנתיים (עצמאים)
}

# Property names that reference a taxonomy. Values must be known entity IDs.
# Source of truth: src/core/taxonomy.py
TAXONOMY_PROPS = {
    "שנת מס": "TAX_YEARS",
    "סטטוס דוח": "STATUSES",
    "פקיד שומה": "PKID_SHOMA",
    "סוג תיק": "SUG_TIK",
}

# Date-shaped property names. Engine writes ISO 8601 with time + Israel TZ
# (see sync_engine._plan_update / _plan_create_or_flag): "%Y-%m-%dT00:00:00+03:00".
# Summit's Date-typed properties reject bare DD/MM/YYYY and bare ISO YYYY-MM-DD
# (Cycle A live, 2026-05-11). Validator tracks engine canonical first; bare ISO
# kept as a defensive fallback so a hand-built operation still passes shallow checks.
DATE_PROPS = {"תאריך אורכה מ\"ה", "תאריך הגשה"}
ACCEPTED_DATE_FORMATS = ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d")


class WriteExecutor:
    """
    Executes a WritePlan against Summit CRM.

    In dry_run mode: validates operations, builds audit log, but makes no API calls.
        validation_mode="shallow" (default): presence check only — fast, no taxonomy lookups.
        validation_mode="deep":              also checks folder whitelist, taxonomy IDs, date formats.
    In live mode: calls update_entity/create_entity for each operation.
    """

    def __init__(
        self,
        client: Optional[SummitAPIClient] = None,
        dry_run: bool = True,
        validation_mode: str = "shallow",
    ):
        if validation_mode not in ("shallow", "deep"):
            raise ValueError(
                "validation_mode must be 'shallow' or 'deep', got %r" % validation_mode
            )
        self.client = client or SummitAPIClient()
        self.dry_run = dry_run
        self.validation_mode = validation_mode

    def execute(self, plan: WritePlan, progress_callback=None) -> WriteResult:
        """Execute all operations in the plan."""
        result = WriteResult(dry_run=self.dry_run)
        total = plan.total

        for i, op in enumerate(plan.operations):
            if op.op_type in (OpType.SKIP, OpType.FLAG):
                result.skipped += 1
                status = "skipped" if op.op_type == OpType.SKIP else "flagged"
                result.audit_log.append(self._audit_entry(op, status))
                continue

            result.total_attempted += 1

            try:
                if self.dry_run:
                    self._validate_operation(op)
                    if self.validation_mode == "deep":
                        self._validate_operation_deep(op)
                    result.succeeded += 1
                    status_label = (
                        "dry_run_ok_deep" if self.validation_mode == "deep" else "dry_run_ok"
                    )
                    result.audit_log.append(self._audit_entry(op, status_label))
                else:
                    api_result = self._execute_single(op)
                    created_id = self._extract_created_id(op, api_result)
                    result.succeeded += 1
                    result.audit_log.append(
                        self._audit_entry(op, "success", created_entity_id=created_id)
                    )
            except (SummitAPIError, ValueError) as e:
                result.failed += 1
                error_info = {
                    "match_key": op.match_key,
                    "client_name": op.client_name,
                    "op_type": op.op_type.value,
                    "error": str(e),
                }
                result.errors.append(error_info)
                result.audit_log.append(self._audit_entry(op, "failed", str(e)))
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
            raise ValueError("Unexpected op_type for execution: %s" % op.op_type)

    def _validate_operation(self, op: WriteOperation):
        """Shallow validation — presence only. Cheap, runs always."""
        if op.op_type in (OpType.UPDATE_REPORT, OpType.UPDATE_CLIENT):
            if not op.entity_id:
                raise ValueError("Missing entity_id for %s" % op.op_type.value)
        if not op.folder_id:
            raise ValueError("Missing folder_id")
        if not op.properties:
            raise ValueError("Empty properties — nothing to write")

    def _validate_operation_deep(self, op: WriteOperation):
        """
        Deep validation — collects ALL problems, then raises a single ValueError
        listing every issue. Catches malformed plans before they hit Summit.

        Checks:
          1. folder_id is in ALLOWED_FOLDERS
          2. Each TAXONOMY_PROPS field references a known taxonomy entity ID
          3. Each DATE_PROPS field parses as ISO YYYY-MM-DD
        """
        problems: list = []

        if str(op.folder_id) not in ALLOWED_FOLDERS:
            problems.append(
                "folder_id %r not in ALLOWED_FOLDERS %s" % (op.folder_id, sorted(ALLOWED_FOLDERS))
            )

        for prop_name, value in op.properties.items():
            if prop_name in TAXONOMY_PROPS:
                problems.extend(self._check_taxonomy(prop_name, value))
            elif prop_name in DATE_PROPS:
                problems.extend(self._check_date(prop_name, value))

        if problems:
            raise ValueError(
                "Deep validation failed for op %s (entity=%s, match_key=%s):\n  - %s"
                % (op.op_type.value, op.entity_id, op.match_key, "\n  - ".join(problems))
            )

    def _check_taxonomy(self, prop_name: str, value) -> list:
        """Verify the value is a known taxonomy entity ID. Returns list of problems."""
        if value is None or value == "":
            return ["%s is empty" % prop_name]

        # Engine writes taxonomy refs as ints. Accept str digits for resilience.
        try:
            value_id = int(value)
        except (TypeError, ValueError):
            return ["%s value %r is not a numeric entity ID" % (prop_name, value)]

        family = TAXONOMY_PROPS[prop_name]
        if family == "TAX_YEARS":
            if value_id not in taxonomy.TAX_YEARS.values():
                return ["%s ID %d not in TAX_YEARS %s" %
                        (prop_name, value_id, sorted(taxonomy.TAX_YEARS.values()))]
        elif family == "STATUSES":
            if value_id not in taxonomy.STATUSES:
                return ["%s ID %d not in STATUSES %s" %
                        (prop_name, value_id, sorted(taxonomy.STATUSES.keys()))]
        elif family == "PKID_SHOMA":
            known = {e["id"] for e in taxonomy.PKID_SHOMA}
            # Partial taxonomy — only error if NOT in partial list AND full not loaded
            if value_id not in known and not taxonomy.is_loaded():
                return ["%s ID %d not in partial PKID_SHOMA and full taxonomy not loaded "
                        "(run load_full_taxonomies first, or accept partial check)"
                        % (prop_name, value_id)]
            if value_id not in known and taxonomy.is_loaded():
                return ["%s ID %d not in PKID_SHOMA" % (prop_name, value_id)]
        elif family == "SUG_TIK":
            known = {e["id"] for e in taxonomy.SUG_TIK}
            if value_id not in known and not taxonomy.is_loaded():
                return ["%s ID %d not in partial SUG_TIK and full taxonomy not loaded"
                        % (prop_name, value_id)]
            if value_id not in known and taxonomy.is_loaded():
                return ["%s ID %d not in SUG_TIK" % (prop_name, value_id)]
        return []

    def _check_date(self, prop_name: str, value) -> list:
        """
        Verify the value parses against one of ACCEPTED_DATE_FORMATS.
        Engine canonical output is DD/MM/YYYY (sync_engine._plan_update).
        ISO YYYY-MM-DD is accepted as a defensive fallback.
        Returns list of problems.
        """
        if value is None or value == "":
            return []  # Empty dates are allowed
        if not isinstance(value, str):
            return ["%s value %r is not a string" % (prop_name, value)]
        for fmt in ACCEPTED_DATE_FORMATS:
            try:
                datetime.strptime(value, fmt)
                return []
            except ValueError:
                continue
        return ["%s value %r does not match accepted formats %s"
                % (prop_name, value, list(ACCEPTED_DATE_FORMATS))]

    def _extract_created_id(self, op: WriteOperation, api_result) -> Optional[int]:
        """For CREATE_REPORT, pull the new entity ID out of the Summit response."""
        if op.op_type != OpType.CREATE_REPORT or not isinstance(api_result, dict):
            return None
        # Summit's create_entity returns {"ID": ..., "Folder": ..., "Properties": {...}}
        new_id = api_result.get("ID") or api_result.get("EntityID")
        try:
            return int(new_id) if new_id else None
        except (TypeError, ValueError):
            return None

    def _audit_entry(
        self,
        op: WriteOperation,
        status: str,
        error: str = "",
        created_entity_id: Optional[int] = None,
    ) -> dict:
        """
        Build an audit log entry.

        For successful CREATE_REPORT ops, stash the new entity ID under
        properties_written._created_entity_id so the revert script can find it
        without needing a schema change to write_logs.
        """
        properties_written = dict(op.properties) if op.properties else {}
        if created_entity_id is not None:
            properties_written["_created_entity_id"] = created_entity_id

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "op_type": op.op_type.value,
            "entity_id": op.entity_id,
            "folder_id": op.folder_id,
            "match_key": op.match_key,
            "client_name": op.client_name,
            "properties_written": properties_written,
            "old_values": op.old_values,
            "status": status,
            "error": error,
        }
