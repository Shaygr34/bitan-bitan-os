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

## Getting started

See individual app READMEs under `apps/` for setup instructions.
