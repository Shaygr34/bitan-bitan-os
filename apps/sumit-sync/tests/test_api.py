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


# ------------------------------------------------------------------ #
#  PR4: Download, Exception review, Completion
# ------------------------------------------------------------------ #

def _run_full_pipeline(client, golden_idom_file, golden_sumit_file):
    """Helper: create → upload → execute → return run detail."""
    run = client.post("/runs", json={"year": 2024, "report_type": "financial"}).json()
    run_id = run["id"]
    with open(golden_idom_file, "rb") as f:
        client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "idom_upload"},
            files={"file": ("idom.xlsx", f, "application/octet-stream")},
        )
    with open(golden_sumit_file, "rb") as f:
        client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "sumit_upload"},
            files={"file": ("sumit.xlsx", f, "application/octet-stream")},
        )
    client.post(f"/runs/{run_id}/execute")
    return client.get(f"/runs/{run_id}").json()


def test_download_file(client, golden_idom_file, golden_sumit_file):
    """Download endpoint returns file bytes with correct headers."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]
    file_id = detail["files"][0]["id"]

    resp = client.get(f"/runs/{run_id}/files/{file_id}/download")
    assert resp.status_code == 200
    assert len(resp.content) > 0
    cd = resp.headers.get("content-disposition", "")
    assert "attachment" in cd or "filename" in cd


def test_download_file_404(client):
    """Download with invalid file_id returns 404."""
    run = client.post("/runs", json={"year": 2024, "report_type": "financial"}).json()
    resp = client.get(f"/runs/{run['id']}/files/00000000-0000-0000-0000-000000000000/download")
    assert resp.status_code == 404


def test_patch_exception(client, golden_idom_file, golden_sumit_file):
    """PATCH exception changes resolution status."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]
    exc_id = detail["exceptions"][0]["id"]
    assert detail["exceptions"][0]["resolution"] == "pending"

    resp = client.patch(
        f"/runs/{run_id}/exceptions/{exc_id}",
        json={"resolution": "acknowledged", "note": "OK"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolution"] == "acknowledged"
    assert body["resolution_note"] == "OK"
    assert body["resolved_at"] is not None


def test_bulk_patch_exceptions(client, golden_idom_file, golden_sumit_file):
    """Bulk PATCH marks all pending exceptions as acknowledged."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]
    pending_count = sum(1 for e in detail["exceptions"] if e["resolution"] == "pending")
    assert pending_count > 0

    resp = client.patch(
        f"/runs/{run_id}/exceptions/bulk",
        json={"resolution": "acknowledged"},
    )
    assert resp.status_code == 200
    assert resp.json()["updated_count"] == pending_count

    # Verify all are now acknowledged
    detail2 = client.get(f"/runs/{run_id}").json()
    for exc in detail2["exceptions"]:
        assert exc["resolution"] != "pending"


def test_complete_run(client, golden_idom_file, golden_sumit_file):
    """POST complete transitions run to completed."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]
    assert detail["status"] == "review"

    resp = client.post(f"/runs/{run_id}/complete")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


def test_complete_locks_mutations(client, golden_idom_file, golden_sumit_file):
    """After complete, upload/execute/exception PATCH return 409."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]
    exc_id = detail["exceptions"][0]["id"]

    client.post(f"/runs/{run_id}/complete")

    # Upload blocked
    with open(golden_idom_file, "rb") as f:
        resp = client.post(
            f"/runs/{run_id}/upload",
            data={"file_role": "idom_upload"},
            files={"file": ("idom.xlsx", f, "application/octet-stream")},
        )
    assert resp.status_code == 409

    # Exception PATCH blocked
    resp = client.patch(
        f"/runs/{run_id}/exceptions/{exc_id}",
        json={"resolution": "acknowledged"},
    )
    assert resp.status_code == 409

    # Bulk blocked
    resp = client.patch(
        f"/runs/{run_id}/exceptions/bulk",
        json={"resolution": "acknowledged"},
    )
    assert resp.status_code == 409

    # Double-complete blocked
    resp = client.post(f"/runs/{run_id}/complete")
    assert resp.status_code == 409

    # Download still works
    file_id = detail["files"][0]["id"]
    resp = client.get(f"/runs/{run_id}/files/{file_id}/download")
    assert resp.status_code == 200


# ------------------------------------------------------------------ #
#  Drill-down endpoint
# ------------------------------------------------------------------ #

def test_drill_down_unmatched(client, golden_idom_file, golden_sumit_file):
    """Drill-down into unmatched returns exception rows."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]

    resp = client.get(f"/runs/{run_id}/drill-down/unmatched")
    assert resp.status_code == 200
    body = resp.json()
    assert body["metric"] == "unmatched"
    assert body["total_rows"] >= 1
    assert len(body["columns"]) > 0
    assert len(body["rows"]) == body["total_rows"]


def test_drill_down_matched(client, golden_idom_file, golden_sumit_file):
    """Drill-down into matched reads import_output Excel sheet."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]

    resp = client.get(f"/runs/{run_id}/drill-down/matched")
    assert resp.status_code == 200
    body = resp.json()
    assert body["metric"] == "matched"
    assert body["total_rows"] >= 1
    assert len(body["columns"]) > 0


def test_drill_down_changed(client, golden_idom_file, golden_sumit_file):
    """Drill-down into changed reads diff_report Changes sheet."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]

    resp = client.get(f"/runs/{run_id}/drill-down/changed")
    assert resp.status_code == 200
    body = resp.json()
    assert body["metric"] == "changed"


def test_drill_down_idom_records(client, golden_idom_file, golden_sumit_file):
    """Drill-down into idom_records reads upload file."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]

    resp = client.get(f"/runs/{run_id}/drill-down/idom_records")
    assert resp.status_code == 200
    body = resp.json()
    assert body["metric"] == "idom_records"
    assert body["total_rows"] >= 4


def test_drill_down_invalid_metric(client, golden_idom_file, golden_sumit_file):
    """Invalid metric name returns 400."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]

    resp = client.get(f"/runs/{run_id}/drill-down/bogus")
    assert resp.status_code == 400


def test_drill_down_pagination(client, golden_idom_file, golden_sumit_file):
    """Pagination params work for drill-down."""
    detail = _run_full_pipeline(client, golden_idom_file, golden_sumit_file)
    run_id = detail["id"]

    resp = client.get(f"/runs/{run_id}/drill-down/matched?limit=1&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["rows"]) <= 1
    assert body["total_rows"] >= 1
