"""
IDOM-SUMIT Sync Service — FastAPI entry point.

PR1: health endpoint only. API routes added in PR2.
"""

from fastapi import FastAPI
from sqlalchemy import text

from .db.connection import engine
from .storage.file_store import volume_writable

app = FastAPI(
    title="IDOM-SUMIT Sync Service",
    version="0.1.0",
    docs_url="/docs",
)


@app.get("/health")
def health():
    """
    Health check for Railway zero-downtime deploys.
    Verifies DB connectivity and volume writability.
    """
    # Check DB
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass

    # Check volume
    vol_ok = volume_writable()

    status = "ok" if (db_ok and vol_ok) else "degraded"

    return {
        "status": status,
        "db": "connected" if db_ok else "unreachable",
        "volume": "writable" if vol_ok else "read-only",
    }
