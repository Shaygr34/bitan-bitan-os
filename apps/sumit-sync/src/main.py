"""
IDOM-SUMIT Sync Service — FastAPI entry point.
"""

import logging
import os

from fastapi import FastAPI
from sqlalchemy import text

from .db.connection import engine
from .storage.file_store import volume_writable
from .api.routes import router as runs_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="IDOM-SUMIT Sync Service",
    version="0.2.0",
    docs_url="/docs",
)

app.include_router(runs_router)


@app.on_event("startup")
def _startup_diagnostics():
    """Log configuration on boot so Railway logs show what's going on."""
    logger.info("=== SUMIT-SYNC STARTUP ===")
    logger.info("PORT=%s", os.environ.get("PORT", "(not set, default 8000)"))
    logger.info("DATA_DIR=%s", os.environ.get("DATA_DIR", "/data"))
    logger.info("DATABASE_URL set: %s", "YES" if os.environ.get("DATABASE_URL") else "NO")
    logger.info("Engine: %s", "created" if engine is not None else "FAILED")
    logger.info("==========================")


@app.get("/health")
def health():
    """
    Health check for Railway zero-downtime deploys.
    Always returns 200 so the container stays up.
    Reports DB / volume status as sub-fields.
    """
    # Check DB — tolerate engine=None (bad DATABASE_URL) gracefully
    db_status = "engine_failed"
    if engine is not None:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                db_status = "connected"
        except Exception as exc:
            db_status = f"unreachable: {exc}"

    # Check volume
    vol_ok = volume_writable()

    status = "ok" if (db_status == "connected" and vol_ok) else "degraded"

    return {
        "service": "up",
        "status": status,
        "version": app.version,
        "db": db_status,
        "volume": "writable" if vol_ok else "read-only or missing",
    }
