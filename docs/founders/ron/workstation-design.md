# Ron's Workstation — Design

**Date:** 2026-05-12
**Status:** Approved & built (pre-session 1)
**Operator:** Shay
**Reviewed by:** (none yet — this is the compressed design doc per pragmatic-faithful path)

## Why this exists

Ron Bitan is the first founder being onboarded into Bitan OS as a *co-creator* rather than as the principal recipient of operator work. He's technically aware (asking about Sonnet vs Opus, tokens, Cowork, skill design) and brings creative intent (e.g., the תלוש-שכר anomaly idea). The design challenge: enable him to contribute creatively while protecting the substrate.

This workstation is the answer.

## Architecture

Three layers, one membrane, one reviewer.

```
RON'S SURFACE
├── claude.ai Project "Bitan OS Lab"
│   └── Knowledge files (stable layer — persona, doctrine, architecture map)
│
└── Cowork on bitan-bitan-os
    └── (live layer — real repo, real schemas, real CLAUDE.md)
        Branch: ron-lab/* (protected main, sandbox elsewhere)

         ↓ BRIDGE

docs/founders/ron/ron-state.md  (living log)
ron-lab/* branches               (drafts, never merged automatically)

         ↓ BRAINSTORMING REVIEW (Shay + Ron, live)

main (PR-gated, Shay-merged)
```

## The two layers

**Stable layer (claude.ai Project Knowledge):**
- Persona and operating principles (who his agent is)
- Bitan doctrine (no AI mentions, Hebrew-first, brand voice)
- Architecture map (the territory)
- Coda Bridge explainer for Ron (so he sees the loop he's in — transparency = trust)
- Fallback founder-partner persona (in case the in-repo protocol isn't loaded)

**Live layer (Cowork on `bitan-bitan-os`):**
- The actual repo (always current by construction)
- `CLAUDE.md` — Bitan OS rules and doctrine
- `docs/founders/founder-partner-protocol.md` — in-repo mirror of the founder-partner skill
- `docs/founders/ron/` — Ron's state and onboarding artifacts
- `ron-lab/*` branches — his playground

## The Enable / Guard duality

- **Enable**: rich curated Knowledge in claude.ai + live Cowork access + his own state file + freedom on `ron-lab/*` branches
- **Guard**: branch protection on main, founder-partner protocol's "never push to main / never destructive without operator confirm" rules, PR-gated promotion to main, state file as audit trail

## The Brainstorming Review

The Brainstorming Review is the felt-moment replacement for code review. It happens at the end of each Ron session: Shay and Ron look at the draft *together*, talk about it, and decide what crosses to main. Code review's gatekeeping function is still there — it just doesn't *feel* like gatekeeping to Ron.

For session 1, the Brainstorming Review is the closing 20 minutes of the agenda.

## The Symbiotic Evolution loop

The `founder-partner` skill (global at `~/.claude/skills/founder-partner/SKILL.md`, mirrored in-repo at `docs/founders/founder-partner-protocol.md`) is **bidirectional**:

- **Substrate → Skill**: when Tetra/Dodeca/Coda patterns evolve, update the skill
- **Skill → Substrate**: when founder sessions surface patterns worth keeping, retro into substrate canon

This isn't a static skill. It's a living artifact. After every session, ask: did the founder reveal something the substrate should know? If yes — propagate.

## What this enables

- **Tonight**: Ron sits down and his agent partners with him on his ideas
- **Session 2+**: Ron drives toward concrete artifacts (e.g., תלוש skill) with the workstation already wired
- **Future founders**: Amir, others — same pattern, with founder-archetype variations in the skill
- **mini-Coda**: a future review agent that pre-digests `<name>-state.md` for Shay, scaling the operator's review capacity

## What this explicitly does NOT do

- **No production deploys from `ron-lab/*` branches.** If a CI configuration triggers Railway on any branch, that's a bug to fix before letting Ron break it.
- **No auto-merge.** All merges to main go through Shay (or, later, mini-Coda + Shay).
- **No cross-founder leakage.** Ron's state file and lab don't surface in Amir's eventual workstation, and vice versa.
- **No founder access to other clients' data.** Ron is principal at Bitan, so this is moot here. But the pattern matters for future founders.

## Design provenance

This design was produced in a single brainstorming session on 2026-05-12, ahead of Ron's 15:30 session. Path B (pragmatic-compress) was chosen over Path A (formal spec → review loop → plan → implement) because:

- Scope was bounded (5 wiring tasks)
- Risk was sandboxed by definition
- Time pressure was explicit (2.5 hours)
- The design was validated through dialog, not assumed

After session 1, this doc gets updated with lessons learned.

## Cross-references

- Global skill: `~/.claude/skills/founder-partner/SKILL.md`
- In-repo protocol: `bitan-bitan-os/docs/founders/founder-partner-protocol.md`
- Ron state: `bitan-bitan-os/docs/founders/ron/ron-state.md`
- Session 1 agenda: `bitan-bitan-os/docs/founders/ron/ron-onboarding-2026-05-12.md`
- Operator memory: `~/.claude/projects/-Users-shay/memory/bitan-ron-workstation-2026-05-12.md`
- Bitan OS root: `bitan-bitan-os/CLAUDE.md` (Founder Lab section)
