# Bitan & Bitan OS — Master System File
## ביטן את ביטן — מערכת הפעלה

**Version:** 1.0 | **Date:** March 15, 2026 | **Owner:** Shay Griever
**Status:** Production (Website live) + Active Development (Content Factory, Summit Integration)

---

## 1. THE FIRM

**ביטן את ביטן — רואי חשבון ויועצי מס**
A second-generation Israeli CPA firm. Founded by Shlomo Bitan, now run by partners **Avi Bitan** (founding partner, CPA + attorney) and **Ron Bitan** (founding partner, CPA + attorney). Located in Electra City Tower, Floor 11, Rechevet 58, Tel Aviv.

**Target audience:** Israeli business owners, חברות בע"מ, עצמאים (B2B). Conservative, high-trust, direct.

**Brand system (locked):**
- Navy: #1B2A4A (primary) / #102040 (dark)
- Gold: #C5A572 (accent, 5-10% usage)
- Typography: Heebo, Hebrew-native
- Aesthetic: "Quiet authority" — conservative, professional, no startup vibes, no green/pastels
- 8px grid, RTL-first everywhere

**Team:** Avi, Ron (partners/approvers), Heli (office manager), Itzik, Carmit, Golan, Guy, Haim, Meshi, Nela, Irina, Hodaya, Ortal, Sarah

---

## 2. SYSTEM ARCHITECTURE — THREE PILLARS

```
┌─────────────────────────────────────────────────────────────┐
│                     BITAN & BITAN OS                         │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   WEBSITE    │  │   CONTENT    │  │      SUMMIT        │  │
│  │             │  │   FACTORY    │  │    CRM + דיוור      │  │
│  │  Next.js 15 │  │             │  │                    │  │
│  │  Sanity CMS │  │  Pipeline:   │  │  Client database   │  │
│  │  Railway    │  │  Source →    │  │  Mailing lists     │  │
│  │  Cloudflare │  │  Score →     │  │  Newsletter sends  │  │
│  │             │  │  Draft →     │  │  Activity tracking │  │
│  │  bitancpa.  │  │  Approve →   │  │                    │  │
│  │  com        │  │  Publish     │  │  api.sumit.co.il   │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│              Article published in Sanity                      │
│                    ↓           ↓                              │
│              Live on site    Newsletter via Summit            │
│                              (manual now, API later)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. PILLAR 1: WEBSITE

### Current State: LIVE ✅
- **Domain:** bitancpa.com (live, DNS via Cloudflare, hosted on Railway)
- **Stack:** Next.js 15, Tailwind CSS, Sanity CMS, Railway (EU West), Cloudflare (DNS/CDN)
- **Domain registrar:** GoDaddy (nameservers pointed to Cloudflare)

### Key Stats
- 77+ Knowledge Center articles (51 original + 26 from WP migration)
- 11 services with enriched content, images, FAQs, process steps
- 281 redirects in middleware (Hebrew) + next.config.ts (English)
- 121 URLs in sitemap
- Hebrew redirect middleware using decodeURIComponent() for WP URL mapping
- ISR revalidation (300s) on content pages
- Google Search Console verified + sitemap submitted

### Infrastructure
- **SSL:** Cloudflare Full mode, Railway auto-provisions certificates
- **DNS:** Cloudflare manages zone, CNAME flattening for root domain (proxied mode)
- **Email:** Google Workspace (MX records on aspmx.l.google.com) — completely separate from hosting
- **Old hosting:** cPanel at marketbiz.co — no longer in use, can be decommissioned
- **Railway env vars:** SANITY keys, GA4 ID, RESEND_API_KEY, CONTACT_EMAIL_TO, GOOGLE_AI_API_KEY, OPENAI_API_KEY, NEXT_PUBLIC_SITE_URL=https://bitancpa.com

### Key Technical Decisions
- English slugs for URLs (Hebrew encodes to unreadable percent-strings)
- Hebrew redirects handled in middleware (not next.config.ts — Next.js can't match percent-encoded paths)
- Cloudflare proxy (orange cloud) required for root CNAME flattening
- Railway public domain deleted (only custom domains remain)
- Contact form saves leads to Sanity + sends email via Resend API

### Open Items
- www → root redirect rule in Cloudflare (created, deployed)
- Cloudflare SSL should eventually move to Full (Strict) once Railway SSL is stable
- Google Business Profile: verify website URL is https://bitancpa.com

---

## 4. PILLAR 2: CONTENT FACTORY

### Architecture
An intelligent content production pipeline:
```
CF1: Source Registry (50+ Israeli tax/business sources)
CF2: Headline Scanning (RSS, scraping, APIs)
CF3: De-dup/Clustering
CF4: Value Scoring (relevance to firm's clients)
CF5: Draft Generation (Claude API, Hebrew-native)
CF6: Fact-Check Guardrails ([לאימות] flags)
CF7: Human Approval (Avi/Ron, <2 min per article)
CF8: CMS Push (Sanity)
CF9: Scheduled Publishing
CF10: Performance Loop (feedback into scoring)
CF11: Multi-Format Outputs (web, email, PDF, social)
```

### Current State
- Next.js 14.2 app on Railway with Prisma/PostgreSQL
- ~16 Israeli financial/regulatory sources active
- Claude Sonnet for draft generation (SSE streaming, 180s timeout)
- Puppeteer-core + stealth plugin for scraping
- Draft generation rearchitected from blocking to SSE streaming (Hebrew 4K-token drafts)
- WeasyPrint validated for Hebrew PDF generation (RTL-native)
- Blocks JSON as canonical content format (not Markdown)

### Input Modes
1. **Automated sourcing:** System scans headlines, scores, generates drafts
2. **Manual source input (NEW):** Link/doc/PDF → AI draft → human review → publish
   - This mode was added for one-off articles like regulatory updates
   - The first article using this mode: ביטוח לאומי + מס הכנסה 2026 regulation update

### Article Output Structure
- H1 headline (clear, not clickbait)
- H2 sections per key point
- Short paragraphs (3-4 lines max), bullet lists
- Closing CTA: "לייעוץ פרטני בנושא, צרו קשר עם המשרד"
- Disclaimer: "המידע באתר אינו מהווה תחליף לייעוץ מקצועי פרטני"
- No English where Hebrew exists
- [לאימות] flags for unverified claims
- Meta description (155 chars), categories/tags, verification list

### Key Technical Decisions
- WeasyPrint over ReportLab for Hebrew PDF (ReportLab produces garbled output)
- Heebo is the locked font for all outputs
- SSE streaming required for Hebrew draft generation (sync calls timeout)
- Gov.il sources blocked by Cloudflare WAF (unresolved — may need proxy)

---

## 5. PILLAR 3: SUMMIT CRM

### What Summit Is
Israeli CRM (app.sumit.co.il) — the firm's operational source of truth for clients, billing, and communications. Contains the complete client database with types (חברה, עצמאי, ניכויים, חיצוני).

### Current Usage
- **Mailing lists created:** מעסיקים, עצמאיים, חברות ומנהלים (+ בדיקה test list)
- **Newsletter system:** HTML block templates (header/footer branded) + native text blocks for editable content
- **Sender:** ron@bitancpa.com
- **Templates built:** עדכון מקצועי (professional update) — header + greeting + title + body + CTA button + gold divider + branded footer
- **Compliance:** Israeli spam law (חוק הספאם) — Summit handles unsubscribe natively

### API
- Base URL: api.sumit.co.il
- Known endpoints: POST /emailsubscriptions/mailinglists/list/, POST /emailsubscriptions/mailinglists/add/
- Full API documentation: needs comprehensive crawl (Chrome agent prompt ready)
- Authentication method: TBD (needs discovery)

### Claude ↔ Summit Integration (Planned)
**Architecture: MCP server with permissioned proxy layer**

🟢 **Green Zone** (full access, read + write with human confirmation):
- Contacts metadata (names, types, segments, tags)
- Mailing lists, campaigns, send history
- Client activity log (meetings, notes, interactions)
- Task management, reminders
- Client categorization

🟡 **Yellow Zone** (read-only, aggregated summaries only):
- Revenue trends ("Q1 revenue up 12%")
- Client count by segment, retention metrics
- Aging report summaries ("14 clients overdue >60 days")
- Service distribution stats

🔴 **Red Zone** (hard wall — never reaches Claude):
- Individual invoice amounts / payment details
- Bank account info, payment methods
- Tax file data, הצהרות הון
- Client ID numbers (ת.ז., ח.פ.)
- Any document attached to a client file

**Key principle:** The proxy physically strips red-zone data before it reaches Claude. Claude PREPARES, Ron APPROVES and SENDS. No autonomous actions ever.

### IDOM-SUMIT Synchronization (Background)
A separate workstream for automating SHAAM (Israeli tax authority) → Google Sheets → SUMIT data sync. Currently a working Streamlit prototype with proven Python sync logic. Planned migration to Next.js web deployment within the OS Hub. Key requirement: preserve working sync logic exactly as-is during transition.

---

## 6. NEWSLETTER SYSTEM

### Phase 1 (Current — Manual via Summit)
```
Article approved → Published to Sanity → Live on website
                                        ↓
Ron opens Summit → דיוור במייל → selects list → pastes content into template → sends
```

**Template structure (in Summit editor):**
1. HTML block: branded header (navy + logo)
2. Native text: greeting
3. Native text: article title (editable)
4. Native text: body paragraphs (editable)
5. HTML block: CTA button (change link per article)
6. HTML block: gold divider + branded footer
7. (Summit auto-adds compliance footer)

**Logo URL:** https://bitancpa.com/logo-light.png

### Phase 2 (Planned — Automated for website subscribers)
```
Sanity webhook → "Article Published" event
    ├→ Resend API → auto-email to website subscribers (from Sanity list)
    └→ Ron still sends manually via Summit to CRM clients (richer, curated)
```

### Phase 3 (Planned — Full automation via Summit API)
```
Sanity webhook → API call to Summit → auto-compose campaign → Ron approves → send
```

---

## 7. DISTRIBUTION CHANNELS

| Channel | Status | Audience | Frequency |
|---------|--------|----------|-----------|
| Website (bitancpa.com/knowledge) | ✅ Live | Public + clients | Every article |
| Email — Summit (CRM clients) | ✅ Ready | חברות / עצמאים / ניכויים | Monthly+ |
| Email — Resend (website subscribers) | Phase 2 | Website signups | On publish |
| WhatsApp | Parked | Clients | TBD |
| LinkedIn/Social | Phase 3 | Public | On publish |
| PDF (branded) | Validated (WeasyPrint) | Clients (meetings) | On demand |

### WhatsApp (Parked — Needs Solution)
- Tier 1 (now): Manual broadcast lists via WhatsApp Business App (max 256 contacts)
- Tier 2 (future): WhatsApp Business API via BSP (respond.io or WATI recommended)
- Israel marketing messages: ~$0.04-0.09 per message
- Need: opt-in mechanism, Meta-approved templates, compliance with Israeli privacy law
- Strategy: Email = "magazine" (comprehensive), WhatsApp = "tap on shoulder" (short, urgent)

---

## 8. TEAM PHOTOS

### Current State
- 8 team members have Nano Banana (Gemini) processed headshots: Avi, Ron, Carmit, Golan, Guy, Haim, Heli, Itzik
- All 1024x1024, gray gradient background, faithful face preservation
- Stored in public/team/ in repo + uploaded to Sanity

### Missing Photos (need from team)
- Meshi — has photo but too low resolution (593x345)
- Nela — has photo but background removal failed (600x314)
- Irina, Hodaya, Ortal, Sarah — no photos at all

### Photo Pipeline
Source photo (even selfie) → rembg background removal → transparent PNG → Nano Banana/Gemini (gray gradient studio background) → final PNG → upload to Sanity

---

## 9. SEO & ANALYTICS

- Google Search Console: verified via DNS, sitemap submitted (121 URLs, 98 pages discovered)
- GA4: env var set on Railway (NEXT_PUBLIC_GA4_ID), data stream should point to bitancpa.com
- 281 redirects: every old WordPress URL has a mapping (middleware for Hebrew, next.config.ts for English)
- Hebrew middleware: uses decodeURIComponent() + O(1) Map lookup for ~250 Hebrew slugs
- Catch-all patterns: /category/:path* → /knowledge, /:year/:month/:slug → /knowledge, /author/:path* → /about
- Custom 404 page links to Knowledge Center, Homepage, Contact
- Schema.org: Organization (homepage), Article (articles), FAQPage (FAQ), Service (service pages)
- Canonical URLs: https://bitancpa.com (not www, not Railway)
- robots.txt: disallows /studio/, /api/, includes sitemap link

---

## 10. OPEN ITEMS & ROADMAP

### Immediate (This Week)
- [ ] Article draft (ביטוח לאומי + מס הכנסה 2026) → Avi/Ron review → approve → publish → first newsletter send
- [ ] About page card redesign (Claude Code working on it)
- [ ] 6 missing team photos from team members
- [ ] Test Summit newsletter send to בדיקה list with real content
- [ ] Email send/receive test (ron@bitancpa.com)
- [ ] Mobile QA crawl of live site

### Near-Term (1-4 Weeks)
- [ ] shmunistax.co.il competitive teardown → V3.1 feature list (WhatsApp button, animations, polish)
- [ ] Summit API comprehensive crawl
- [ ] Summit MCP plugin: Phase 1 (mailing list management)
- [ ] Content Factory: PDF/link input mode fully operational
- [ ] Resend Phase 2: automated emails to website subscribers on article publish
- [ ] WhatsApp Tier 2 evaluation (BSP selection)

### Medium-Term (1-3 Months)
- [ ] Summit MCP plugin: Phase 2 (client insights, meeting prep, segmentation)
- [ ] Content Factory: full automated sourcing pipeline (50+ sources)
- [ ] IDOM-SUMIT sync: migrate from Streamlit to web app
- [ ] Service Playbook Templates (V1.1 website feature)
- [ ] Knowledge Center "Learning Product" upgrades
- [ ] About page narrative upgrade (second-generation story, dual qualifications)

---

## 11. KEY PRINCIPLES

1. **Pipeline-first thinking.** Content flows through stages. Each stage has clear input, transformation, output.
2. **Human approval is the bottleneck — design around it.** Everything upstream exists to present work that can be approved in under 2 minutes.
3. **Partner sovereignty.** Avi and Ron must always feel in control. Every AI output is a suggestion requiring explicit human approval.
4. **Intelligence where it matters, determinism everywhere else.** AI for scoring/drafting/analysis. Deterministic systems for formatting/publishing/audit.
5. **Source quality determines everything.** Garbage sources → garbage drafts → partner rejections → wasted work.
6. **Hebrew-native, RTL-first.** Not localization on top of English. Hebrew from the ground up.
7. **Brand is a constitution.** Navy, gold, Heebo, conservative, quiet authority. Not flexible guidelines.
8. **Security by architecture, not by trust.** The proxy strips data. Claude physically cannot see what isn't passed through.
9. **Plan deep, build incremental.** Understand → design → build minimal → test with real data → iterate.
10. **Compound operational leverage.** Every system built should make the next system easier. Every manual process documented becomes the spec for automation.

---

## 12. PEOPLE & ROLES

| Person | Role | System Access |
|--------|------|---------------|
| **Shay** | Technical lead, project manager, system architect | Everything |
| **Avi Bitan** | Founding partner, CPA + attorney. Content approver. | Sanity Studio (admin), Summit |
| **Ron Bitan** | Founding partner, CPA + attorney. Content approver, newsletter sender. | Sanity Studio (admin), Summit, ron@bitancpa.com |
| **Heli** | Office manager, client-facing operations | Sanity Studio (editor), Summit |
| **Claude (AI)** | System architect, content drafter, automation builder | Via Shay's sessions — never autonomous |
| **Claude Code** | Implementation executor | Repo access, Railway deploy |

---

*This is a living document. Update it as systems evolve.*
