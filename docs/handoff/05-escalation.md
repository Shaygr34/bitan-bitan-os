# Escalation & Contact Map

Who to contact for what. Update at handoff with concrete contact details (numbers, emails, times).

---

## The principals

**Avi Bitan** — Managing partner, ~55% of client portfolios. Primary firm-side contact for technical operator. Communicates via WhatsApp.
- Approves: content publishing, onboarding flow changes, any client-facing change
- Don't bother with: routine bug fixes, dependency updates, infra noise

**Ron Bitan** — Managing partner, ~43% of client portfolios. Senior tax authority. Communicates via WhatsApp.
- Approves: tax-content accuracy, calculator constants, regulatory changes
- Holds: GoDaddy account for `bitancpa.com`, firm credit card, firm Google Workspace admin

**Guy** — Office staff, runs the שע"מ → IDOM → Summit reconciliation. Communicates via WhatsApp.
- Owns: monthly Sumit Sync runs, IDOM file exports
- Escalate to him for: data discrepancies in onboarding records, sync failures

**Office staff (general)** — counterparties for newsletter sending (currently copy-paste to Summit), sometimes for client-data lookups.

## Outgoing operator (Shay) — post-handoff status

`[FILL AT HANDOFF]` — one of:
- **Advisory**: available for X hrs/month for Y months at firm's request, response time Z
- **On-call for emergencies only**: defined as system-down events, response within 24h
- **Zero**: no continued involvement; firm absorbs full ownership

Until this is filled in, assume zero. Don't escalate to Shay by default.

## Vendor contacts (technical issues)

| Vendor | When to contact | How |
|--------|-----------------|-----|
| Railway | Service down, billing issues | Railway support chat (in dashboard) |
| Sanity | Studio access issues, schema deploy failures | support@sanity.io |
| Anthropic | API key issues, rate limits | console.anthropic.com support |
| Google Cloud (GCP) | GA4/GSC service account issues | Google Cloud support (paid tier may not be active — check) |
| Resend | Email delivery issues | resend.com support |
| 2Sign | Signing flow broken, account issues | dev@2sign.co.il (responsive); app at app.2sign.co.il |
| Cloudflare | DNS issues for bitancpa.com | dash.cloudflare.com support |
| GoDaddy | Domain registration / renewal of bitancpa.com | Ron handles this — escalate to Ron, not GoDaddy directly |
| GitHub | Actions failures, repo access | GitHub support |
| Summit (CRM) | API issues, data discrepancies | Summit support — firm has the contact |

## Decision authority — who decides what

| Decision type | Operator authority | Firm approval needed |
|---------------|-------------------|----------------------|
| Bug fix to existing functionality | ✅ Yes | No |
| Dependency upgrade (patch/minor) | ✅ Yes | No |
| Dependency upgrade (major) | Notify | Yes |
| Sanity content edit (typo, image swap) | ✅ Yes | No |
| Sanity content publish (new article) | ✅ Yes for drafts; final publish | Avi or Ron review |
| New onboarding flow stage / change | ❌ | Avi |
| Tax constant change (`taxConfig`) | ❌ | Ron |
| New vendor / new integration | ❌ | Avi + Ron |
| Cost increase to firm | ❌ | Ron |
| Onboarding stage advance for a specific client | ✅ if procedural; ❌ if exception | Avi if exception |
| Deletion of historical data (Sanity, Postgres, Summit) | ❌ never unilaterally | Avi + Ron written approval |
| Client-facing email template change | Notify | Yes |
| Adding/removing a team member's headshot | ✅ Yes | No |

## Communication norms

- **Hebrew first** in Avi/Ron channels. English only if they switch.
- **WhatsApp is the main channel.** Email is secondary, used for formal records.
- **Short messages.** A 200-word WhatsApp is unwelcome. Bullet, link, confirm.
- **Don't ping after 20:00 IL** unless system is down.
- **Don't mention AI or "agents" to Avi/Ron** in any operational context. They hired a competent technical operator; that is the identity to maintain.

## When something is on fire

Ranked severity:

1. **Site down (`bitancpa.com` returning 500/down):** start fix immediately. Notify Avi via WhatsApp once you've confirmed it's a real outage and started work.
2. **OS down:** fix before notifying. Office can use Sanity Studio + Summit directly while OS is down — short-term workaround.
3. **Onboarding flow broken (clients can't submit):** notify Avi immediately. Ask whether to pause new intake links while fixing.
4. **Sumit Sync run failed mid-way:** notify Guy. Investigate. Don't restart blindly.
5. **Daily smoke test red:** investigate within 24h. Not an emergency unless multiple endpoints failing.

## Knowledge sources to consult before escalating

Most questions can be answered from these without bothering anyone:

- This handoff package
- The two `CLAUDE.md` files (website + OS)
- `bitan-bitan-os/docs/01_decision_log.md`
- The System Map (`~/bitan-system-map.md` at handoff, copied into repo)
- `summit-mcp/CLAUDE.md`
- Railway logs (for runtime questions)
- Sanity Studio (for content questions)

Escalate only if the question isn't answered in any of these AND it requires firm-side decision authority.
