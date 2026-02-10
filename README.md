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
| `SUMIT_SYNC_API_URL` | **Yes** | Private URL of sumit-sync service (e.g. `http://sumit-sync.railway.internal:8000`) |
| `PORT` | Auto | Railway injects |

**How to find the private URL:** In Railway dashboard → sumit-sync service → Settings → Networking → Private URL. Use the `railway.internal` hostname, not the public one, for lower latency and no egress costs.

### 2. sumit-sync (FastAPI)

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | Yes | Railway Postgres plugin auto-injects |
| `PORT` | Auto | Railway injects (default 8000) |
| `DATA_DIR` | Recommended | `/data` (volume mount) |

**Volume:** Mount a Railway Volume at `/data` for file persistence.

### Debugging connectivity

1. Hit `https://<os-hub-url>/api/sumit-sync/__debug` in your browser — it shows whether `SUMIT_SYNC_API_URL` is set, the resolved hostname, and a live health check against the Python service.
2. Hit `https://<sumit-sync-url>/health` directly to verify the Python service is up.

## Getting started

See individual app READMEs under `apps/` for setup instructions.
