# claude.ai Project Kit — Ron Bitan

**For Shay. Paste-ready artifacts for setting up Ron's claude.ai Project "Bitan OS Lab" before 15:30.**

## Setup steps

1. Open claude.ai → create new Project → name it **"Bitan OS Lab"**
2. Paste `00-system-prompt.md` content into the Project's **system prompt** field
3. Upload these files as **Project Knowledge**:
   - `01-substrate-map.md` — what Bitan OS is, where things live
   - `02-fallback-persona.md` — founder-partner protocol (fallback in case Cowork doesn't auto-load the in-repo version)
4. Test: open a fresh chat in the Project. Ask in Hebrew: "תארתי לי, איפה אני נמצא?" — agent should describe Bitan OS in plain Hebrew without code-speak, mention the bridge, and offer to start.
5. Test Cowork: from inside the Project, open Cowork on `bitan-bitan-os` repo. Confirm it reads CLAUDE.md and shows the new `docs/founders/founder-partner-protocol.md` file.

## File map

| File | Purpose | Upload? |
|---|---|---|
| `README.md` | This file. Setup instructions. | No |
| `00-system-prompt.md` | Project system prompt. | No — *paste* into Project settings |
| `01-substrate-map.md` | Architecture + doctrine + Coda bridge explainer for Ron | **Yes — upload to Knowledge** |
| `02-fallback-persona.md` | Founder-partner protocol fallback (mirror of in-repo protocol) | **Yes — upload to Knowledge** |

## After setup

Verify the loop:

1. Ron opens his Project → talks to it in Hebrew about an idea
2. He opens Cowork → his agent in Cowork already knows Bitan OS (via CLAUDE.md + founder-partner-protocol.md)
3. He works on `ron-lab/*` branch → his agent logs to `docs/founders/ron/ron-state.md`
4. Session closes → Brainstorming Review with Shay → merge or defer

If all four steps work, the wiring is complete.

## If something doesn't work

- **Cowork doesn't see the founder-partner protocol**: confirm `docs/founders/founder-partner-protocol.md` exists on the branch Cowork is reading. Confirm `CLAUDE.md` has the Founder Lab pointer.
- **Agent doesn't speak Hebrew**: re-check the system prompt — Hebrew-first should be the first line.
- **Agent claims certainty on tax facts**: that's a guard violation. Update the system prompt or skill.

## Evolution

This kit will evolve. When Amir or future founders are onboarded, fork this directory (`docs/founders/<name>/claude-ai-project-kit/`) and adapt.
