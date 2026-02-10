# ---- IDOM-SUMIT Sync Service ----
# Python 3.12 on Debian slim. Runs FastAPI via uvicorn.
# Railway injects DATABASE_URL + PORT at runtime.

FROM python:3.12-slim AS base

WORKDIR /app

# System deps for psycopg2-binary (Postgres)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
COPY alembic/ alembic/
COPY alembic.ini .

ENV PORT=8000

# Diagnostics on startup, then run uvicorn
RUN printf '#!/bin/sh\necho "=== SUMIT-SYNC DEPLOY ==="\necho "DATABASE_URL set: $([ -n \"$DATABASE_URL\" ] && echo YES || echo NO)"\necho "DATA_DIR: ${DATA_DIR:-/data}"\necho "PORT: ${PORT:-8000}"\necho "========================"\nexec uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
