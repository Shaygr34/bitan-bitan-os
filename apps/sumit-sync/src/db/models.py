"""
SQLAlchemy models for IDOM-SUMIT Sync.

Schema derived from real SyncResult fields and actual exception types
produced by the reconciliation engine.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, SmallInteger, Integer, Float, Text, DateTime,
    ForeignKey, UniqueConstraint, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Run(Base):
    """
    Immutable record of a reconciliation run.
    Once status='completed', no mutations allowed (enforced at API layer).
    """
    __tablename__ = "runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    year = Column(SmallInteger, nullable=False)
    report_type = Column(String(20), nullable=False)  # 'annual' | 'financial'
    status = Column(String(20), nullable=False, default="uploading")
    operator_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    files = relationship("RunFile", back_populates="run", cascade="all, delete-orphan")
    metrics = relationship("RunMetrics", back_populates="run", uselist=False, cascade="all, delete-orphan")
    exceptions = relationship("Exception", back_populates="run", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("year >= 2020 AND year <= 2100", name="valid_year"),
        CheckConstraint(
            "report_type IN ('annual', 'financial')",
            name="valid_report_type",
        ),
        CheckConstraint(
            "status IN ('uploading', 'processing', 'review', 'completed', 'failed')",
            name="valid_status",
        ),
    )


class RunFile(Base):
    """Uploaded input files and generated output artifacts."""
    __tablename__ = "run_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    file_role = Column(String(30), nullable=False)
    original_name = Column(String(255), nullable=False)
    stored_path = Column(String(500), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    run = relationship("Run", back_populates="files")

    __table_args__ = (
        CheckConstraint(
            "file_role IN ('idom_upload', 'sumit_upload', 'import_output', 'diff_report', 'exceptions_report')",
            name="valid_file_role",
        ),
    )


class RunMetrics(Base):
    """
    Aggregate metrics for a completed run.
    Fields match SyncResult dataclass from sync_engine.py.
    """
    __tablename__ = "run_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Counts from SyncResult
    total_idom_records = Column(Integer, nullable=False, default=0)
    total_sumit_records = Column(Integer, nullable=False, default=0)
    matched_count = Column(Integer, nullable=False, default=0)
    unmatched_count = Column(Integer, nullable=False, default=0)
    changed_count = Column(Integer, nullable=False, default=0)
    unchanged_count = Column(Integer, nullable=False, default=0)

    # Status-specific counts from SyncResult
    status_completed_count = Column(Integer, nullable=False, default=0)
    status_preserved_count = Column(Integer, nullable=False, default=0)
    status_regression_flags = Column(Integer, nullable=False, default=0)

    processing_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    run = relationship("Run", back_populates="metrics")


class Exception(Base):
    """
    Individual exception/flag from reconciliation.

    Real exception types produced by the engine:
    - no_sumit_match:    IDOM record has no counterpart in SUMIT export
    - idom_duplicate:    Multiple IDOM records share the same מספר_תיק
    - status_regression: SUMIT says completed, but IDOM has no submission date
    """
    __tablename__ = "exceptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)

    exception_type = Column(String(30), nullable=False)
    severity = Column(String(10), nullable=True, default="medium")

    # Reference data from source records
    idom_ref = Column(String(100), nullable=True)   # מספר_תיק
    sumit_ref = Column(String(100), nullable=True)   # מזהה
    client_name = Column(String(255), nullable=True)  # שם
    description = Column(Text, nullable=False)
    field_diffs = Column(JSONB, nullable=True)

    # Resolution (review workflow)
    resolution = Column(String(20), nullable=False, default="pending")
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    run = relationship("Run", back_populates="exceptions")

    __table_args__ = (
        CheckConstraint(
            "exception_type IN ('no_sumit_match', 'idom_duplicate', 'status_regression')",
            name="valid_exception_type",
        ),
        CheckConstraint(
            "resolution IN ('pending', 'acknowledged', 'dismissed')",
            name="valid_resolution",
        ),
    )
