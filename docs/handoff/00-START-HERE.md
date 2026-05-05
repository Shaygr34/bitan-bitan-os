# START HERE — Bitan & Bitan System Handoff

If you've just inherited the Bitan & Bitan digital operation, this is the first thing to read.

## What you're inheriting

Three Git repositories, one Postgres database, one Sanity CMS, ~10 vendor accounts, and a content + onboarding pipeline serving a Hebrew-language CPA firm with ~960 active clients.

The system runs. Your job is to keep it running.

## What this package contains

| File | Purpose |
|------|---------|
| `00-START-HERE.md` | This file. Read first. |
| **System Map** (`~/bitan-system-map.md` at handoff time, copied into repo as `01-system-map.md`) | Complete inventory of every system, integration, and entanglement. The spine. |
| `02-runbook.md` | Day-to-day operations: what runs, what to check, what to do when something breaks. |
| **Bridge Pattern** (System Map §2.4) | The single most important section. How firm requests become code. Read this before quoting on the engagement. |
| `04-voice-guide.md` | Editorial voice + brand language for content work. |
| `05-escalation.md` | Who to contact for what. |
| `06-credentials-checklist.md` | Day-1 verification: what credentials to obtain, what to test. |

## Read in this order

1. This file (5 min)
2. System Map cover + §2.4 Bridge Pattern (15 min) — **non-negotiable**
3. `06-credentials-checklist.md` (5 min)
4. `bitan-bitan-website/CLAUDE.md` (45 min, dense)
5. `bitan-bitan-os/CLAUDE.md` (45 min, dense)
6. `02-runbook.md` (30 min)
7. `05-escalation.md` (5 min)
8. Rest of System Map (30 min)
9. `bitan-bitan-os/docs/01_decision_log.md` (browse)
10. `summit-mcp/CLAUDE.md` (15 min)

Total time-to-functional: ~3.5 hours focused reading. After that, do one CMS edit, run one test deploy, then you're operational.

## Critical things to know before you sign

**1. The Bridge Pattern is the system's operating mode.** Almost 100% of new development and operational work originates as a WhatsApp message from Avi or Ron, gets translated/screenshot-relayed by the operator (previously Shay), and is implemented by AI agents (Claude Code or equivalent). You inherit this workflow or you replace it with traditional dev hours — pricing decisions hinge on this. See System Map §2.4.

**2. Maintain, not evolve.** The firm has hired you to keep this running. New features, new tools, new integrations are NOT in scope unless explicitly initiated by the firm in a separate engagement. Do not pick up items in the "Forward Work" or "Deferred / On Hold" sections of the System Map.

**3. Hebrew literacy is required.** Avi and Ron communicate in Hebrew. The CMS content is Hebrew. Tax law context is Israeli. A non-Hebrew-reading operator cannot run this engagement.

**4. Seven known bugs are live in onboarding.** Listed in System Map §5.3. Inherited as-is. Bug fixes are in scope; refactoring is not.

**5. Sumit Sync has not had a successful production run yet.** Infrastructure proven, awaiting one uninterrupted execution. You may need to participate in the first successful run.

## Authority defaults

Unless the firm tells you otherwise:

- **You can:** ship deploys to production, edit Sanity content, advance onboarding stages, respond to firm WhatsApp requests via the Bridge Pattern, fix bugs, update dependencies, swap API keys when vendors rotate.
- **You should escalate:** any architectural change, any new vendor or integration, any cost over `[firm-defined threshold]`, any change to onboarding flow logic, any change to tax constants in `taxConfig` Sanity singleton, any deletion of historical Sanity content.
- **You should not:** mention AI to Avi, Ron, or any of their clients. The firm sees you as the technical operator. The AI layer is internal infrastructure, not part of the customer-facing identity.

## Day-1 onboarding tasks

In this order:

1. Run through `06-credentials-checklist.md` end-to-end. Don't skip.
2. Pull all 3 repos locally (URLs in System Map §1.1). Run `npm install` in each. Verify they build.
3. Get Railway dashboard access. Verify both projects' services are green.
4. Get Sanity Studio access at `bitancpa.com/studio`. Edit one article (revert before saving). Confirms write permissions.
5. Read the System Map §1.9 Architecture Notes for Successor.
6. Schedule a 30-minute call with Shay (if advisory mode is in scope) or Avi/Ron (if not).
7. WhatsApp introduction to Avi and Ron — short, in Hebrew if possible.

## When you're stuck

- Code question: check the relevant `CLAUDE.md` first. They're dense but accurate.
- Operational question: `02-runbook.md`.
- "Who do I tell about this?": `05-escalation.md`.
- Vendor / billing / account question: System Map §3.
- "Why was this built this way?": `bitan-bitan-os/docs/01_decision_log.md`.

If the question is not answered in any of these, that's a gap to flag and document. Update the System Map. The map is a living document — the next operator (or a future you) needs your additions.

---

**Signed:** Outgoing operator (Shay) at handoff. Last updated: 2026-05-04.
