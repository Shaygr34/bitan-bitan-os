"""
Shared test fixtures for IDOM-SUMIT Sync.

Creates synthetic Excel inputs matching the exact column schemas
that idom_parser and sumit_parser expect.
"""

import os
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

import pytest
import pandas as pd
from openpyxl import Workbook
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from src.db.models import Base


# --------------- Database (in-memory SQLite) ---------------

@pytest.fixture()
def db_engine():
    """SQLite in-memory engine for tests."""
    engine = create_engine("sqlite:///:memory:")
    # SQLite doesn't enforce CHECK constraints by default
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    """Yields a fresh DB session, rolls back after each test."""
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.rollback()
    session.close()


# --------------- Temp directories ---------------

@pytest.fixture()
def tmp_data_dir(tmp_path, monkeypatch):
    """Set DATA_DIR to a temp directory for file_store isolation."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    return tmp_path / "data"


# --------------- Golden fixture: FINANCIAL report ---------------

# Known test data (Financial report type)
# 5 IDOM rows → 4 after dedup (row 4 duplicates row 1's מספר_תיק)
# 4 SUMIT rows for year 2024
#
# Expected matching:
#   123456789 → matched, has submission → status completed
#   987654321 → matched, no submission, extension updated
#   111111111 → matched, SUMIT completed, no IDOM submission → regression flag
#   555555555 → no SUMIT match → exception
#   123456789 (dup) → deduplicated away (row 4 has older extension)

IDOM_ROWS = [
    # מספר תיק | שם            | תאריך ארכה  | תאריך הגשה  | קוד שידור | שנת שומה | מח
    ("123456789", "כהן יעקב",   "2024-06-30",  "2024-05-15", "100",  "2024", "01"),
    ("987654321", "לוי שרה",    "2024-09-30",  None,          "200",  "2024", "02"),
    ("555555555", "אברהם דוד",  "2024-06-30",  None,          "300",  "2024", "01"),
    ("111111111", "גולן רחל",   "2024-06-30",  None,          "400",  "2024", "03"),
    ("123456789", "כהן יעקב",   "2024-03-31",  None,          "100",  "2024", "01"),  # dup - older extension
]

# SUMIT Financial export: columns from FINANCIAL_EXPORT_SCHEMA.all_columns
SUMIT_FINANCIAL_HEADERS = [
    'מזהה', 'שנת מס', 'כרטיס לקוח', 'מספר לקוח', 'ח.פ',
    'מנהל תיק', 'מנהל/ת חשבונות', 'עובד/ת ביקורת', 'עובד ע. מקדימה', 'עובד מטפל',
    'סטטוס', 'הערות', 'תחילת עבודה', 'סיום עבודה מקדימה', 'הגשה',
    'חבות מס', 'אורכה מ"ה', 'אורכה משרד'
]

# Status codes: "1125886300: 9) תהליך הושלם" = completed
STATUS_COMPLETED_LABEL = "1125886300: 9) תהליך הושלם"
STATUS_IN_PROGRESS = "1125886200: 3) בעבודה"

SUMIT_ROWS = [
    # מזהה  | שנת מס (ID:Label)      | כרטיס לקוח     | מספר לקוח | ח.פ       | ... fields ...
    (1001, "1125575564: 2024", "100: כהן יעקב",   "100", "123456789",
     "דן", "נועה", "אלי", "משה", "יונתן",
     STATUS_IN_PROGRESS, "", None, None, None, 0, "2024-06-30", "2024-03-31"),

    (1002, "1125575564: 2024", "200: לוי שרה",     "200", "987654321",
     "דן", "נועה", "אלי", "משה", "יונתן",
     STATUS_IN_PROGRESS, "", None, None, None, 0, "2024-06-30", "2024-01-31"),

    (1003, "1125575564: 2024", "300: גולן רחל",    "300", "111111111",
     "דן", "נועה", "אלי", "משה", "יונתן",
     STATUS_COMPLETED_LABEL, "הושלם", None, None, "2024-04-01", 0, "2024-06-30", "2024-06-30"),

    (1004, "1125575564: 2024", "400: ישראלי מוטי", "400", "222222222",
     "דן", "נועה", "אלי", "משה", "יונתן",
     STATUS_IN_PROGRESS, "", None, None, None, 0, "2024-06-30", "2024-03-31"),
]


@pytest.fixture()
def golden_idom_file(tmp_path) -> Path:
    """Create a synthetic IDOM Excel file with known test data."""
    wb = Workbook()
    ws = wb.active
    ws.title = "IDOM"

    headers = ["מספר תיק", "שם משפחה ופרטי", "תאריך ארכה", "תאריך הגשה", "קוד שידור", "ס'ש", "מח"]
    ws.append(headers)

    for row in IDOM_ROWS:
        tik, name, ext_date, sub_date, code, year, mch = row
        ws.append([
            int(tik),
            name,
            datetime.strptime(ext_date, "%Y-%m-%d") if ext_date else None,
            datetime.strptime(sub_date, "%Y-%m-%d") if sub_date else None,
            code,
            year,
            mch,
        ])

    path = tmp_path / "idom_test.xlsx"
    wb.save(path)
    return path


@pytest.fixture()
def golden_sumit_file(tmp_path) -> Path:
    """Create a synthetic SUMIT Financial export with known test data."""
    wb = Workbook()
    ws = wb.active
    ws.title = "SUMIT Export"

    ws.append(SUMIT_FINANCIAL_HEADERS)

    for row in SUMIT_ROWS:
        values = list(row)
        # Convert date strings to datetime objects for date columns
        for idx in [12, 13, 14, 16, 17]:  # תחילת עבודה, סיום, הגשה, אורכה מ"ה, אורכה משרד
            if values[idx] and isinstance(values[idx], str):
                values[idx] = datetime.strptime(values[idx], "%Y-%m-%d")
        ws.append(values)

    path = tmp_path / "sumit_export_test.xlsx"
    wb.save(path)
    return path
