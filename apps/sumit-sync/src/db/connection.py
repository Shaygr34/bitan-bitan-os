"""
Database connection management.
Reads DATABASE_URL from environment (injected by Railway).
Engine creation is safe at import — SQLAlchemy engines are lazy
(no actual connection until .connect() is called).
"""

import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./dev.db",  # fallback for local dev only
)

# Railway Postgres URLs start with postgres:// but SQLAlchemy 2.0 requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Wrapped in try/except so a completely invalid URL doesn't crash the import chain.
# If engine is None, the app boots but /health reports db=error.
try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    logger.info("SQLAlchemy engine created (dialect=%s)", DATABASE_URL.split("://")[0])
except Exception as exc:
    logger.error("Failed to create SQLAlchemy engine: %s", exc)
    engine = None

SessionLocal = sessionmaker(
    bind=engine, autocommit=False, autoflush=False
) if engine else None


def get_db() -> Session:
    """FastAPI dependency — yields a DB session, closes on teardown."""
    if SessionLocal is None:
        raise RuntimeError("Database is not configured (engine creation failed)")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
