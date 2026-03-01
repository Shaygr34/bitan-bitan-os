"""
Smoke test for the FastAPI health endpoint.
Verifies the app boots and /health responds.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.db.models import Base
from src.db.connection import get_db
from src.main import app


def _make_test_engine():
    """Thread-safe in-memory SQLite engine (StaticPool + check_same_thread=False)."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def _pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(eng)
    return eng


@pytest.fixture()
def health_client(tmp_path, monkeypatch):
    """TestClient with a real in-memory DB so /health can query it."""
    engine = _make_test_engine()
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    import src.storage.file_store as fs
    fs.DATA_DIR = tmp_path / "data"

    # Patch global engine used by /health
    import src.db.connection as conn_mod
    _orig_engine = conn_mod.engine
    conn_mod.engine = engine

    Session = sessionmaker(bind=engine)

    def _override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    conn_mod.engine = _orig_engine
    engine.dispose()


def test_health_returns_200(health_client):
    response = health_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "status" in body
    assert "db" in body
    assert "volume" in body
