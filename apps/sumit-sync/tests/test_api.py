"""
Integration tests for the FastAPI routes.

Uses SQLite in-memory DB and tmp_path volume to test
the full create → upload → execute → get flow.
"""

import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from src.db.models import Base
from src.db.connection import get_db
from src.main import app


@pytest.fixture()
def test_db():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def _pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(test_db, tmp_path, monkeypatch):
    """TestClient wired to in-memory DB and tmp volume."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    # Reload file_store to pick up new DATA_DIR
    import src.storage.file_store as fs
    fs.DATA_DIR = tmp_path / "data"

    def _override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_run(client):
    resp = client.post("/runs", json={"year": 2024, "report_type": "financial"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["year"] == 2024
    assert body["report_type"] == "financial"
    assert body["status"] == "uploading"
    assert "id" in body


def test_create_run_invalid_type(client):
    resp = client.post("/runs", json={"year": 2024, "report_type": "invalid"})
    assert resp.status_code == 422


def test_create_run_invalid_year(client):
    resp = client.post("/runs", json={"year": 1900, "report_type": "financial"})
    assert resp.status_code == 422


def test_upload_file(client, golden_idom_file):
    # Create run
    run = client.post("/runs", json={"year": 2024, "report_type": "financial"}).json()
    run_id = run["id"]

    # Upload IDOM file
    with open(golden_idom_file, "rb") as f:
        resp = client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "idom_upload"},
            files={"file": ("idom.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["file_role"] == "idom_upload"
    assert body["size_bytes"] > 0


def test_upload_duplicate_role(client, golden_idom_file):
    run = client.post("/runs", json={"year": 2024, "report_type": "financial"}).json()
    run_id = run["id"]

    with open(golden_idom_file, "rb") as f:
        client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "idom_upload"},
            files={"file": ("idom.xlsx", f, "application/octet-stream")},
        )

    with open(golden_idom_file, "rb") as f:
        resp = client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "idom_upload"},
            files={"file": ("idom2.xlsx", f, "application/octet-stream")},
        )
    assert resp.status_code == 409


def test_execute_missing_files(client):
    run = client.post("/runs", json={"year": 2024, "report_type": "financial"}).json()
    resp = client.post(f"/runs/{run['id']}/execute")
    assert resp.status_code == 400


def test_full_pipeline(client, golden_idom_file, golden_sumit_file):
    """End-to-end: create → upload both → execute → verify results."""
    # Create
    run = client.post("/runs", json={"year": 2024, "report_type": "financial"}).json()
    run_id = run["id"]

    # Upload IDOM
    with open(golden_idom_file, "rb") as f:
        resp = client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "idom_upload"},
            files={"file": ("idom.xlsx", f, "application/octet-stream")},
        )
    assert resp.status_code == 200

    # Upload SUMIT
    with open(golden_sumit_file, "rb") as f:
        resp = client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "sumit_upload"},
            files={"file": ("sumit.xlsx", f, "application/octet-stream")},
        )
    assert resp.status_code == 200

    # Execute
    resp = client.post(f"/runs/{run_id}/execute")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "review"  # has exceptions
    assert body["metrics"]["matched_count"] == 3
    assert body["metrics"]["unmatched_count"] == 1
    assert body["metrics"]["status_regression_flags"] == 1
    assert body["exception_count"] == 2  # 1 unmatched + 1 regression
    assert len(body["output_files"]) == 3

    # Get run detail
    resp = client.get(f"/runs/{run_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["status"] == "review"
    assert detail["metrics"] is not None
    assert detail["metrics"]["total_idom_records"] == 4
    assert len(detail["files"]) == 5  # 2 uploads + 3 outputs
    assert len(detail["exceptions"]) >= 2  # unmatched + regression


def test_list_runs(client):
    client.post("/runs", json={"year": 2024, "report_type": "financial"})
    client.post("/runs", json={"year": 2023, "report_type": "annual"})

    resp = client.get("/runs")
    assert resp.status_code == 200
    runs = resp.json()
    assert len(runs) == 2


def test_get_run_404(client):
    resp = client.get("/runs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
