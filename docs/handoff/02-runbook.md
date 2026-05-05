# Operational Runbook

How to keep Bitan & Bitan running. Day-to-day tasks, common firm requests, failure modes.

This is **not** a spec or a vision doc. It is the practical guide for an inheriting operator.

---

## Daily

There is no required daily ritual. The system runs autonomously. Optional checks (5 min each):

- **Daily smoke test status:** GitHub Actions tab on the website repo. Should show a green "Smoke Test" run from 10:00 IL. If red, an email alert went to `shay@bitancpa.com` (re-route to firm inbox at handoff). Investigate any failed endpoint.
- **Railway dashboards:** quick eyeball at both projects (`bitan-bitan-website`, `bitan-bitan-os`). All services should be green.
- **WhatsApp from Avi / Ron:** the actual operational input channel. If they messaged, that's today's queue.

If nothing red and nothing inbound, the system needs nothing from you today.

## Weekly

Optional review (15 min):

- **Weekly performance report email:** auto-generated, sent to Avi + Ron via Resend. Confirm it arrived. If not, check the GitHub Actions log.
- **Weekly dependency audit:** opens GitHub Issues if anything is outdated/vulnerable. Triage. Most are noise; security advisories are not.
- **Onboarding pipeline glance** in OS dashboard: are clients moving through stages? Stuck clients (>14 days in same stage) deserve a flag — don't act, but tell Avi/Ron.
- **Sanity Studio:** scan recent edits. Avi/Ron edit articles directly; if you see broken/empty fields, fix or flag.

## Monthly

No required monthly ritual. Optional:

- Check Railway billing — confirm charges are landing on firm card (post-handoff state).
- Review API key rotations. Anthropic, Google AI, Resend — if any vendor sent a rotation notice, rotate.
- Skim the decision log (`bitan-bitan-os/docs/01_decision_log.md`). Add an entry if you made any architectural decision in the last month.

## When Avi or Ron WhatsApps you

This is the most common operational event. Workflow:

1. **Read the message carefully.** Hebrew, often informal, sometimes a screenshot of an issue with one of their clients in Summit or on the website.
2. **Reply with an acknowledgment** in Hebrew. They expect a human, not silence.
3. **Categorize the request:**
   - **Content/CMS edit:** new article, FAQ tweak, service description update → Sanity Studio. Do it directly. Confirm back.
   - **Bug report:** something broken on the website or in OS → reproduce, fix, deploy, confirm back.
   - **New onboarding for a client:** they want to send an intake link → OS `/onboarding` → "New Client" modal → generate link → send to them.
   - **Question about a feature:** answer from your knowledge of the system. If you don't know, check the relevant `CLAUDE.md` or escalate to Shay (if advisory) or buy time and research.
   - **Request for new functionality:** OUT OF SCOPE for maintenance engagement. Reply: "אני מבין. זה תוסף חדש למערכת — אעביר את זה לדיון נפרד עם המשרד" (paraphrase). Do not start implementing.
4. **If you implemented something:** ship it (see "How to ship a code change" below), then reply with confirmation.

## How to ship a code change

Per repo (all 3 follow this flow):

1. `git checkout -b <descriptive-branch-name>`
2. Edit code. Local test where possible (`npm run dev`, `npm test`).
3. `git commit -m "..."` then `git push`.
4. Open PR on GitHub. CI runs (smoke for website, etc.).
5. Merge to `main`. Railway auto-deploys on merge.
6. Watch Railway deploy logs. Verify the new revision is healthy (green status, no error spike).
7. Manually verify the change in production.
8. Confirm back to Avi/Ron.

⚠ **Production deploys are direct from `main` merge — no staging environment.** Be cautious. Test locally before merging. Don't merge speculative changes.

## Common firm requests + how to handle

**"Add a new article on [topic]"** → Use Content Factory in OS (`/content-factory`) for AI-assisted draft, or write directly in Sanity Studio. Default authors: Avi + Ron. Default category: "מס הכנסה" (override if topic dictates). Generate OG image via the factory's image gen step. Push to Sanity. Confirm with Avi/Ron before publishing.

**"Update tax rates for [year]"** → Two paths: (a) edit `taxConfig` Sanity singleton ("הגדרות מחשבונים") — preferred, no deploy needed. (b) edit `src/lib/tax-tables-2026.ts` in website repo + run `npm test` (32 regression tests) + deploy. Sanity wins at runtime if both are populated.

**"New service / change service description"** → Sanity Studio → Services → edit. Live immediately.

**"Onboard new client"** → OS `/onboarding` → "New Client" → fill basic info → generate intake link → send link to Avi/Ron via WhatsApp (or directly to client per their preference).

**"Smoke test alert email"** → check the failed endpoint. Most often the OG image generation route times out or a Sanity query returns malformed data. Fix and re-deploy.

**"Article ABC is broken on the website"** → reproduce locally. Common causes: empty Sanity field that should be required, image asset missing from CDN, schema mismatch after a recent migration.

**"Something on the onboarding form isn't saving"** → check OS Railway logs. Most commonly a Summit API rate-limit hit (60 calls/batch is the tuned limit). Wait, retry.

**"The Sumit Sync run is stuck"** → known issue: zombie runs stay in "processing" forever. Manual intervention in Postgres `runs` table. Also: ensure Guy used template V2 for the IDOM export with תאריך הגשה column.

## Failure modes & first response

| Symptom | First check | Likely cause |
|---------|-------------|--------------|
| Website 500 | Railway logs (website project) | Sanity query throwing, env var missing |
| OS 500 | Railway logs (os-hub service) | Sanity write token missing/wrong, Postgres connection |
| Onboarding form submit fails | OS Railway logs + Summit API rate | Rate limit hit, retry; or Summit creds expired |
| Daily smoke test red | GitHub Actions logs | Specific endpoint failing — fix endpoint |
| Sanity Studio won't load | Browser console | API token missing or expired; Studio is at `bitancpa.com/studio` |
| Image generation broken | Check `GOOGLE_AI_API_KEY` set on Railway | Key rotated/missing |
| 2Sign signing not advancing | Check 2Sign webhook in OS logs | Webhook URL changed or 2Sign account suspended |
| Resend emails not sending | Check `RESEND_API_KEY` set | Key rotated, or domain re-verification needed |
| Sumit Sync zombie run | Postgres `runs` table | Mid-run deploy interrupted; mark stale row complete manually |

For anything not in this table: read the relevant `CLAUDE.md`, check Railway logs, escalate per `05-escalation.md`.

## Code-level "do not touch" list

These are load-bearing. Edit only with clear understanding.

- `next.config.ts` (website) — 139+ Hebrew redirects (percent-encoded). Breaking these breaks SEO.
- `apps/os-hub/src/lib/sanityClient.ts` — dual-token write pattern fallback. New write code must follow.
- `apps/sumit-sync/app/services/idom_parser.py` — multi-sheet workbook parser. Sheet names matter.
- The 4 "external write" Sanity schemas (`onboardingRecord`, `intelligenceItem`, `weeklyMetrics`, `contentOpportunity`) — they look unused but are written by external scripts/cron.

## What you'll be tempted to clean up but shouldn't

- 11 migration scripts in website `scripts/` — already flagged for archive but harmless. Don't delete; archive into `scripts/_archive/` if you want a tidier tree.
- 5 stale OS docs in `docs/` (chromium-verification, OPUS_INTERVENTION_BRIEF, etc.) — same, archive don't delete.
- The `Documents` tab in OS — purpose unclear at handoff time, do not remove without asking.
- Unused-looking schemas in Sanity bundle — see "do not touch" above.

---

When the runbook is wrong, fix it. When you find a new failure mode, add it. The next operator (or the firm itself) needs your additions.
