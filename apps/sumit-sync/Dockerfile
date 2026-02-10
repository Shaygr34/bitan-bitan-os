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
COPY entrypoint.sh .
RUN chmod +x /app/entrypoint.sh

# PORT is injected by Railway at runtime; default to 8000 for local dev
ENV PORT=8000

CMD ["/app/entrypoint.sh"]
