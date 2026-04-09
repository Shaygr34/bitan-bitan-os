# Content Factory V2 — Brief for Avi & Ron Explainer

> **Purpose:** This doc is source material for Claude.ai to generate a Hebrew one-pager for Avi & Ron explaining the new Content Factory system.

---

## What Changed

The Bitan OS Content Factory was rebuilt to match how Ron actually creates articles. Instead of an automated scraping pipeline that nobody used, it's now a hands-on tool where Ron/Avi upload their source materials and the system does the heavy lifting.

## The Old Way (before V2)

1. Ron finds a topic (e.g., new ביטוח לאומי regulation)
2. Ron uploads reference docs to his personal Claude.ai chat
3. Claude generates the article text
4. Ron manually copy-pastes into Sanity CMS, field by field (title, body, SEO, slug...)
5. Ron asks Shay to generate the hero image
6. Shay runs a script, uploads the image to Sanity
7. Ron publishes in Sanity
8. Ron manually creates newsletter HTML, pastes into Summit, sends

**Problems:** Too many manual steps, depends on Shay for images, no brand consistency guarantee, no audit trail.

## The New Way (V2)

All from within the Bitan OS at one URL:

### Step 1: Upload References
- Go to **Content Factory → מאמר חדש**
- Drag-and-drop PDF or DOCX files (e.g., לשכת יועצי המס slides, ביטוח לאומי circular, tax authority publication)
- Optionally add a topic description and specific instructions

### Step 2: AI Generates Draft
- Click **"צור טיוטה"**
- The system extracts text from the uploaded files
- Claude AI (the same engine behind Claude.ai) writes a complete Hebrew article in the Bitan brand voice:
  - Professional but accessible language
  - Structured with headings, bullet points, callouts
  - Includes SEO title, meta description, TL;DR summary, practical checklist
  - Only uses information from the source documents (won't invent numbers or dates)
  - 800-1,500 words
- Takes 1-3 minutes (shows loading indicator)

### Step 3: Edit the Draft
- The system opens the article editor automatically
- Ron/Avi can edit everything: title, headings, paragraphs, lists, quotes
- Add/remove/reorder content blocks
- All changes saved to the OS database

### Step 4: Push to Website
- Click **"העבר לאתר"** — one button
- The system populates ALL Sanity fields automatically:
  - Title, slug, body (formatted), authors, categories, tags
  - SEO title, SEO description, excerpt, TL;DR
  - Difficulty level, practical checklist, AI disclaimer
- Article appears as a draft in Sanity Studio for final review

### Step 5: Generate Hero Image
- Click **"צור תמונה"**
- AI generates a branded illustration (navy + gold, no text/people, topic-relevant visuals)
- Image uploads directly to Sanity and attaches to the article
- No need to ask Shay

### Step 6: Newsletter
- Click **"שלח ניוזלטר"**
- System generates branded HTML email with the article title, excerpt, and link (with tracking UTM params)
- Preview the email in the system
- Click "העתק HTML" → paste into Summit CRM → send
- (Future: direct send from the system)

### Step 7: Publish
- Final review in Sanity Studio (see it as it will appear on the website)
- Click publish in Sanity → live on bitancpa.com

## What Ron/Avi Need to Know

- **No training needed for the upload flow** — it's drag-and-drop
- **The AI knows the Bitan brand** — it's pre-configured with the firm's writing style, Hebrew standards, and professional tone
- **Always review the AI draft** — it's a starting point, not a final product. Check facts, numbers, and legal references
- **Images are generated, not stock photos** — they match the site's visual language automatically
- **Newsletter includes tracking** — UTM parameters let us measure how many people click through from email to website

## What's NOT in V2 (Coming Later)

- Direct newsletter send from the system (currently copy-paste to Summit)
- URL/link as reference source (currently only PDF/DOCX files)
- Authentication/login (currently open — internal URL only)
- Analytics dashboard in the OS

## Technical Details (for Shay's reference, not for the one-pager)

- Claude Sonnet 4.6 for draft generation (~$0.10-0.30 per article)
- Gemini Imagen for image generation (Google AI Studio free tier)
- Sanity API for CMS push (existing infrastructure)
- Summit CRM for newsletter distribution (existing infrastructure)
- Railway auto-deploys on merge to main
- New env var needed: `GOOGLE_AI_API_KEY` on Railway

## Tone for the One-Pager

- Hebrew, professional but warm
- Focus on the workflow, not the technology
- Use screenshots if available (Shay can provide)
- Emphasize: "this replaces the manual process — same quality, less friction"
- Don't oversell the AI — frame it as "a smart assistant that drafts, you approve"
