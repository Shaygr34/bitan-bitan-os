#!/bin/sh
set -e

echo "=== SUMIT-SYNC DEPLOY ==="
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "DATA_DIR: ${DATA_DIR:-/data}"
echo "PORT: ${PORT:-8000}"
echo "========================"

# Run Alembic migrations (create tables if they don't exist).
# If DATABASE_URL is not set or DB is unreachable, log the error but don't crash —
# the app will boot in degraded mode and /health will report db status.
if [ -n "$DATABASE_URL" ]; then
  echo "Running Alembic migrations..."
  if python -m alembic upgrade head; then
    echo "Migrations complete."
  else
    echo "WARNING: Alembic migration failed. App will start in degraded mode."
  fi
else
  echo "WARNING: DATABASE_URL not set — skipping migrations."
fi

exec uvicorn src.main:app --host 0.0.0.0 --port "${PORT:-8000}"
