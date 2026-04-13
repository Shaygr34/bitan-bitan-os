"""
Execute a WritePlan against the Summit API.

Supports dry-run mode (validates + logs without writing)
and live mode (actually writes to Summit).

Every operation is logged with before/after values for audit.
"""
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
            if op.op_type in (OpType.SKIP, OpType.FLAG):
                result.skipped += 1
                status = "skipped" if op.op_type == OpType.SKIP else "flagged"
                result.audit_log.append(self._audit_entry(op, status))
                continue

            result.total_attempted += 1

            try:
                if self.dry_run:
                    self._validate_operation(op)
                    result.succeeded += 1
                    result.audit_log.append(self._audit_entry(op, "dry_run_ok"))
                else:
                    self._execute_single(op)
                    result.succeeded += 1
                    result.audit_log.append(self._audit_entry(op, "success"))
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
        """Validate an operation without executing it."""
        if op.op_type in (OpType.UPDATE_REPORT, OpType.UPDATE_CLIENT):
            if not op.entity_id:
                raise ValueError("Missing entity_id for %s" % op.op_type.value)
        if not op.folder_id:
            raise ValueError("Missing folder_id")
        if not op.properties:
            raise ValueError("Empty properties — nothing to write")

    def _audit_entry(self, op: WriteOperation, status: str, error: str = "") -> dict:
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
