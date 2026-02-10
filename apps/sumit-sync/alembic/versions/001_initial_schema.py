"""Initial schema: runs, run_files, run_metrics, exceptions.

Revision ID: 001
Revises: None
Create Date: 2025-02-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- runs ---
    op.create_table(
        "runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("report_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="uploading"),
        sa.Column("operator_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("year >= 2020 AND year <= 2100", name="valid_year"),
        sa.CheckConstraint("report_type IN ('annual', 'financial')", name="valid_report_type"),
        sa.CheckConstraint(
            "status IN ('uploading', 'processing', 'review', 'completed', 'failed')",
            name="valid_status",
        ),
    )

    # --- run_files ---
    op.create_table(
        "run_files",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_role", sa.String(30), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "file_role IN ('idom_upload', 'sumit_upload', 'import_output', 'diff_report', 'exceptions_report')",
            name="valid_file_role",
        ),
    )
    op.create_index("idx_run_files_run_id", "run_files", ["run_id"])

    # --- run_metrics ---
    op.create_table(
        "run_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("total_idom_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_sumit_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("matched_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unmatched_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("changed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unchanged_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status_completed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status_preserved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status_regression_flags", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processing_seconds", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # --- exceptions ---
    op.create_table(
        "exceptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exception_type", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(10), nullable=True, server_default="medium"),
        sa.Column("idom_ref", sa.String(100), nullable=True),
        sa.Column("sumit_ref", sa.String(100), nullable=True),
        sa.Column("client_name", sa.String(255), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("field_diffs", JSONB(), nullable=True),
        sa.Column("resolution", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "exception_type IN ('no_sumit_match', 'idom_duplicate', 'status_regression')",
            name="valid_exception_type",
        ),
        sa.CheckConstraint(
            "resolution IN ('pending', 'acknowledged', 'dismissed')",
            name="valid_resolution",
        ),
    )
    op.create_index("idx_exceptions_run_id", "exceptions", ["run_id"])
    op.create_index("idx_exceptions_resolution", "exceptions", ["run_id", "resolution"])


def downgrade() -> None:
    op.drop_table("exceptions")
    op.drop_table("run_metrics")
    op.drop_table("run_files")
    op.drop_table("runs")
