"""
Pydantic schemas for request/response validation.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------- Requests ----------

class CreateRunRequest(BaseModel):
    year: int = Field(..., ge=2020, le=2100)
    report_type: str = Field(..., pattern=r"^(annual|financial)$")
    operator_notes: Optional[str] = None


class PatchExceptionRequest(BaseModel):
    resolution: str = Field(..., pattern=r"^(acknowledged|dismissed)$")
    note: Optional[str] = None


class BulkPatchExceptionsRequest(BaseModel):
    resolution: str = Field(..., pattern=r"^(acknowledged|dismissed)$")


# ---------- Responses ----------

class RunFileOut(BaseModel):
    id: str
    file_role: str
    original_name: str
    size_bytes: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class RunMetricsOut(BaseModel):
    total_idom_records: int
    total_sumit_records: int
    matched_count: int
    unmatched_count: int
    changed_count: int
    unchanged_count: int
    status_completed_count: int
    status_preserved_count: int
    status_regression_flags: int
    processing_seconds: Optional[float]

    model_config = {"from_attributes": True}


class ExceptionOut(BaseModel):
    id: str
    exception_type: str
    severity: Optional[str]
    idom_ref: Optional[str]
    sumit_ref: Optional[str]
    client_name: Optional[str]
    description: str
    field_diffs: Optional[Dict[str, Any]]
    resolution: str
    resolution_note: Optional[str]
    resolved_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class RunOut(BaseModel):
    id: str
    year: int
    report_type: str
    status: str
    operator_notes: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class RunDetailOut(RunOut):
    files: List[RunFileOut] = []
    metrics: Optional[RunMetricsOut] = None
    exceptions: List[ExceptionOut] = []


class ExecuteResultOut(BaseModel):
    run_id: str
    status: str
    metrics: RunMetricsOut
    exception_count: int
    output_files: List[str]
    warnings: List[str]


class BulkPatchResultOut(BaseModel):
    updated_count: int


class DrillDownOut(BaseModel):
    metric: str
    total_rows: int
    columns: List[str]
    rows: List[Dict[str, Any]]
