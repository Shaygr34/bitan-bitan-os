# Day-1 Credentials & Verification Checklist

Work through this in order on day 1. Each item is "obtain access" + "verify it works."

Status legend: `[ ]` = todo, `[~]` = obtained but not verified, `[x]` = obtained + verified.

---

## Phase 1 — Repo & code access (~30 min)

- [ ] **GitHub repo access** to all 3:
  - `Shaygr34/bitan-bitan-website` (or firm GitHub org equivalent post-handoff)
  - `Shaygr34/bitan-bitan-os`
  - `Shaygr34/summit-mcp`
- [ ] Clone all 3 locally
- [ ] In each: `npm install` succeeds (Python `pip install` for `apps/sumit-sync`)
- [ ] In each: `npm run dev` (or equivalent) starts a local server without errors

## Phase 2 — Cloud platform access (~1 hr)

- [ ] **Railway** — invited as collaborator/admin to both projects (`bitan-bitan-website`, `bitan-bitan-os`)
  - Verify: see services, see logs, can trigger a redeploy
- [ ] **Sanity** — invited to org `otEvC6b9a` "Bitan CPA"
  - Verify: open `bitancpa.com/studio`, edit one article (revert before saving), upload a test image
- [ ] **Cloudflare** — added as admin or member on the `shay@bitancpa.com` account
  - Verify: see DNS records for `bitancpa.com`, can edit a TXT record (revert immediately)
- [ ] **GoDaddy** — coordinate with Ron. You may not need direct GoDaddy access; Ron can manage domain renewals. Confirm renewal date.
- [ ] **GitHub Actions secrets** — verify you can read (not necessarily write) the secrets needed for CI

## Phase 3 — Vendor accounts (~1 hr)

- [ ] **Anthropic console** — added to firm Anthropic account (post-financial-separation)
  - Verify: see API keys, see usage dashboard, can rotate a key
- [ ] **Google AI / Gemini** — access to firm Google account holding the API key
  - Verify: see key in API console, test image generation locally
- [ ] **GCP `bitan-ga4-reader` project** — IAM role added under firm Google Workspace
  - Verify: see project, see service account `bitan-analytics@bitan-ga4-reader.iam.gserviceaccount.com`, can download credentials JSON
- [ ] **Resend** — added to `bitancpa` account
  - Verify: see API keys, see domain verification status for `bitancpa.com`, send a test email
- [ ] **2Sign** — credentials for `digital@bitan-finance.co.il`
  - Verify: log in to app.2sign.co.il, see test tasks, view API docs
- [ ] **Summit CRM** — operator account on the firm's Summit instance
  - Verify: log in, see clients, can run a test API call via the MCP server
- [ ] **Elfsight** — access to the account holding the reviews widget
  - Verify: see widget config, see reviews feed

## Phase 4 — Environment variables (~30 min)

Cross-reference each Railway service's env vars against these:

**website (`bitan-bitan-website`):**
- [ ] `SANITY_API_TOKEN` — read-write token, verify Studio can write
- [ ] `RESEND_API_KEY` — verify contact form sends
- [ ] `CONTACT_EMAIL_TO` — destination for contact submissions
- [ ] Other env vars per `bitan-bitan-website/CLAUDE.md`

**os-hub (`bitan-bitan-os/apps/os-hub`):**
- [ ] `SANITY_API_WRITE_TOKEN` (preferred) or `SANITY_API_TOKEN` — verify content factory can push
- [ ] `ANTHROPIC_API_KEY` — verify content factory drafting works
- [ ] `GOOGLE_AI_API_KEY` — verify image generation works
- [ ] `RESEND_API_KEY` — verify onboarding emails send
- [ ] Summit MCP URL / credentials — verify intake creates Summit entities
- [ ] `DATABASE_URL` (Postgres) — verify OS connects
- [ ] `2SIGN_*` — verify signing flow works

**sumit-sync (`bitan-bitan-os/apps/sumit-sync`):**
- [ ] All Summit credentials, שע"מ credentials per `bitan-bitan-os/CLAUDE.md`

**summit-mcp:**
- [ ] Summit API token, MCP server config

## Phase 5 — Operational tools (~30 min)

- [ ] **Claude Code (or equivalent agentic IDE)** — installed locally, working with the cloned repos
  - The Bridge Pattern (System Map §2.4) requires this. If you're not comfortable with agentic AI development, raise this with the firm now, not later.
- [ ] **Hebrew input on your dev machine** — verify you can type Hebrew comfortably
- [ ] **WhatsApp Web or Desktop** — for Avi/Ron/Guy communication
- [ ] **A password manager** of your choice — for tracking the credentials above. Firm did not have one at handoff time; you set the standard.

## Phase 6 — End-to-end verification (~30 min)

After all of the above, run these tests in order:

1. **Edit one Sanity article** via Studio. Confirm it appears on bitancpa.com (may need cache-bust; see CLAUDE.md notes on `useCdn: false`).
2. **Submit a test contact form** on bitancpa.com. Confirm:
   - Lead lands in Sanity (`contactLead` document)
   - Email arrives at `CONTACT_EMAIL_TO`
3. **Trigger one onboarding intake** via OS. Confirm:
   - Summit entity created
   - Auto-email sent
   - Stage advances when expected
4. **Run one daily smoke test manually** via GitHub Actions "Run workflow" button. Confirm green.
5. **Deploy a no-op change** to one repo (e.g., README whitespace). Confirm Railway picks it up and the deploy succeeds.

If all 5 pass, you're operational.

## Phase 7 — Document gaps

Anything in this checklist that didn't work, didn't have a credential available, or surfaced a question — write it down. Update this file. The next operator (or future you) needs your additions.

---

**Remember:** until financial separation is complete (per System Map §3.3), some accounts may still be on outgoing-operator personal billing. Coordinate with the firm to swap to firm card before relying on those vendors long-term.
