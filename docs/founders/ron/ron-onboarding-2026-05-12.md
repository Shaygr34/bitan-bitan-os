# Ron — Onboarding Session — 2026-05-12 15:30

## What this session is

Ron's first session inside Bitan OS as a founder-partner. **Not a feature build.** A workstation wiring session: getting his claude.ai Project + Cowork + lab branch connected, so future sessions feel like the system already knows him.

## Goal

By session end, Ron should:

1. Have a working claude.ai Project ("Bitan OS Lab") with his persona and Knowledge files loaded
2. Have opened a Cowork session on `bitan-bitan-os` and felt his agent partner with him
3. Have written at least one idea or note into `ron-state.md` (proof the loop works)
4. Understand the bridge: *his branch → PR → Shay review → merge*
5. Walk away wanting to come back

## Anti-goal

**Shipping the תלוש-שכר skill today.** Payslip work is the natural target for *session 2*, after session 1 has wired the workstation. We resist the temptation to ship something on day one.

Rationale: the workstation is the leverage. A rushed first artifact would set a bad precedent (skip-the-wiring-to-ship) for every future founder session.

## Agenda (~90 min, plus 5-min pre-brief at 15:25)

| Phase | Time | Lead | Description |
|---|---|---|---|
| Pre-brief | 5 min | Shay | What we built for him, why it matters, the Enable/Guard duality, where the bridge lives. |
| Workstation tour | 15 min | Shay | claude.ai Project → Cowork → state file → branch. Show, don't tell. |
| Free play | 45 min | Ron + agent | Ron picks one idea (תלוש skill, or anything else) and his agent partners on a *draft*. State file fills in real-time. |
| Brainstorming Review | 20 min | Shay + Ron | Look at the draft together. Discuss. Decide what (if anything) crosses to main. |
| Close | 5 min | Shay | Set next session intent. Update `ron-state.md` "Next-move recommendation." |

## Pre-session checklist (Shay does these by 15:25)

- [ ] Ron added to `bitan-bitan-os` GitHub repo as collaborator
- [ ] claude.ai Project "Bitan OS Lab" created
- [ ] System prompt pasted (see `claude-ai-project-kit/00-system-prompt.md`)
- [ ] Knowledge files uploaded (see `claude-ai-project-kit/` — pick the ones marked "upload")
- [ ] Cowork connection to `bitan-bitan-os` tested (open Cowork, confirm it sees CLAUDE.md and `founder-partner-protocol.md`)
- [ ] `ron-lab/onboarding` branch visible (pushed to remote)
- [ ] Main branch protection verified
- [ ] 5-min pre-brief delivered to Ron

## During-session reminders for the agent

- **Hebrew** with Ron unless he switches
- **Surface ideas as drafts.** Never commit to main.
- **Log everything to `ron-state.md`** as it happens — including ideas Ron doesn't pursue. They're seeds.
- The תלוש skill, if attempted, lives **only** on `ron-lab/*` branches.
- **Bitan doctrine**: no AI mentions in any client-facing artifact. Default authors = רון + אבי. Default category = מס הכנסה.
- **Ask before destructive actions.** Always.

## Success criteria

- Ron leaves feeling that the system understood him
- `ron-state.md` has at least one Ron-authored entry
- Either a draft exists on his lab branch, OR a clear written spec for what session 2 will build
- A clear "Next-move recommendation" appended to `ron-state.md`

## Failure modes to watch for

- **Rushing to ship.** If the agent or Shay starts pushing toward an artifact, slow down. Wiring first.
- **Code over concept.** If Ron's eyes glaze over at code, the agent isn't speaking his vocabulary. Step back.
- **Hidden bridge.** If Ron doesn't understand the PR/review loop by end of session, he won't trust it later. Make it visible.
- **Operator overreach.** Shay running the keyboard instead of Ron. Ron drives the agent. Shay drives the frame.

## Post-session ritual

Within 24h of session end:

1. Update `ron-state.md` — completed items move to "Decisions made", new blockers logged, next-move refreshed
2. Update `~/.claude/projects/-Users-shay/memory/bitan-ron-workstation-2026-05-12.md` with what was learned
3. Symbiotic-Evolution check: did this session reveal anything the global `founder-partner` skill should absorb? If yes, edit `~/.claude/skills/founder-partner/SKILL.md` *and* update the in-repo mirror at `docs/founders/founder-partner-protocol.md`
4. Schedule session 2
