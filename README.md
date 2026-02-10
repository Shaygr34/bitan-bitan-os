# bitan-bitan-os

Operational system for Bitan & Bitan — a repo that coordinates our apps, content pipelines, and decision-making.

## Repository structure

```
apps/           # Application source code
  os-hub/       # Central dashboard & orchestration
  sumit-sync/   # Sumit's sync workflows
  content-engine/ # Content generation & scheduling
docs/           # Living documentation
prompts/        # Reusable AI prompt templates
```

## How we work

- **Web-first**: everything runs in the browser or via cloud services.
- **Small PRs**: each pull request does one thing. Easy to review, easy to revert.
- **Staging required**: nothing goes to production without passing staging.
- **Auditability**: decisions are logged in `docs/01_decision_log.md`.
- **Role separation**: clear ownership per app; shared docs are the glue.

## Railway Deployment (Two Services)

### 1. os-hub (Next.js dashboard)

| Variable | Required | Value |
|---|---|---|
| `SUMIT_SYNC_API_URL` | **Yes** | Use Railway reference variable (see below) |
| `PORT` | Auto | Railway injects |

**Setting SUMIT_SYNC_API_URL correctly:**

Railway assigns a dynamic port to each service. **Do not hard-code a port.** Use a Railway reference variable so the port stays correct across redeploys:

```
SUMIT_SYNC_API_URL = http://sumit-sync.railway.internal:${{sumit-sync.PORT}}
```

In the Railway dashboard: os-hub → Variables → New Variable → paste the above. Railway will resolve `${{sumit-sync.PORT}}` to the actual port (e.g. 8080).

### 2. sumit-sync (FastAPI)

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | Yes | Railway Postgres plugin auto-injects |
| `PORT` | Auto | Railway injects (dynamic — could be 8080, 3000, etc.) |
| `DATA_DIR` | Recommended | `/data` (volume mount) |

**Volume:** Mount a Railway Volume at `/data` for file persistence.

**Migrations:** The entrypoint runs `alembic upgrade head` automatically on every deploy. If the DB is unreachable, the app starts in degraded mode (no crash).

### Debugging connectivity

1. Hit `https://<os-hub-url>/api/sumit-sync/__debug` — shows whether `SUMIT_SYNC_API_URL` is set, the resolved hostname + port, and a live health check against the Python service.
2. Hit `https://<sumit-sync-url>/health` directly to verify the Python service is up and DB is connected.
3. Check deploy logs for `=== SUMIT-SYNC DEPLOY ===` to see which PORT the service is actually using.

## Getting started

See individual app READMEs under `apps/` for setup instructions.
