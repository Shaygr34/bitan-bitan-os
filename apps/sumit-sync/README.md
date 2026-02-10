# sumit-sync

IDOM-SUMIT Sync Service — FastAPI reconciliation engine that compares IDOM and SUMIT data, detects mismatches, and generates import files.

## Architecture

```
src/
  core/           # Business logic (DO NOT MODIFY)
    idom_parser.py, sumit_parser.py, sync_engine.py, output_writer.py
  api/            # FastAPI routes (create run, upload, execute, detail, list)
  db/             # SQLAlchemy models + connection
  storage/        # Volume-backed file storage
tests/
  golden/         # Golden fixture files for regression testing
  conftest.py     # Test DB + synthetic fixture generators
  test_api.py     # API integration tests
  test_golden.py  # Golden regression tests
```

## Railway Setup

### Environment Variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/db` | Railway Postgres plugin auto-injects this |
| `PORT` | Auto | `8000` | Railway injects at runtime; Dockerfile defaults to 8000 |
| `DATA_DIR` | Recommended | `/data` | Volume mount point for uploads + outputs |

### Service Config

- **Root directory**: `apps/sumit-sync`
- **Dockerfile path**: `apps/sumit-sync/Dockerfile`
- **Volume mount**: `/data` (for uploaded/generated files)
- **Health check**: `GET /health` — returns `{"service": "up", "status": "ok"|"degraded", "db": "...", "volume": "..."}`

### Verifying the Service

```bash
# Check health
curl https://<your-sumit-sync-url>/health

# Should return:
# {"service":"up","status":"ok","db":"connected","volume":"writable","version":"0.2.0"}
```

## Local Development

```bash
cd apps/sumit-sync
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

## Tests

```bash
cd apps/sumit-sync
pytest tests/ -v
```
