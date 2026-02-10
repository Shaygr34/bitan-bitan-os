# Content Engine v1.5 — Architecture Report

**Bitan & Bitan | Definitive Implementation Specification**
**Status:** Approved for implementation
**Date:** February 2026
**Author:** Architecture Team (Claude Opus + GPT co-architect)
**Approved by:** Shay (Project Owner)

---

## 1. Executive Summary

### Current State

A working POC (v8) exists that converts a single Hebrew content file into a branded Bitan & Bitan PDF. The pipeline uses WeasyPrint for HTML/CSS-to-PDF conversion, which was selected after ReportLab was proven to produce garbled Hebrew. v8 produced a clean 2-page output with correct RTL, branded header/footer, tables, callout boxes, and section bars. The output was reviewed and accepted as "nice" — sufficient to build forward.

### Critical Discovery During This Planning Phase

The original test input (`Input_DOC_Leasing_Car.docx`) is NOT a real Word document — it is a Pandoc-exported markdown file with a `.docx` extension. The v8 parser was written against this pseudo-format. The second test input (`example_doc_2.docx`) is a genuine Microsoft Word 2007+ DOCX file. This means the v1.5 parser must be rebuilt to handle real DOCX files via python-docx. The Pandoc-markdown path is deprecated.

### Target State (v1.5)

A deterministic engine that accepts real DOCX files authored by Avi/Ron in Word, parses them into structured blocks, and renders branded PDFs with zero manual intervention. Font switched from Noto Sans Hebrew to Heebo (brand-preferred). Parser generalized to handle multiple document structures, not just the leasing document.

### Delta (v8 → v1.5)

| Area | v8 (current) | v1.5 (target) |
|------|-------------|---------------|
| Input format | Pandoc markdown (.docx extension) | Real DOCX (python-docx) |
| Parser | Hardcoded section titles | Generalized heuristics |
| Font | Noto Sans Hebrew | Heebo (Google Fonts, bundled) |
| Template | Python string concatenation | Jinja2 HTML template |
| Brand config | Constants scattered in code | Centralized `brand_config.py` |
| Normalize stage | None | Block merging, validation, cleanup |
| Test coverage | 1 document | 2 documents (leasing short + leasing full) |

---

## 2. Pipeline Architecture

### Stage Diagram

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  STAGE 1     │    │  STAGE 2      │    │  STAGE 3     │    │  STAGE 4      │    │  STAGE 5      │    │  STAGE 6      │
│  INGEST      │───▶│  PARSE        │───▶│  NORMALIZE   │───▶│  TEMPLATE     │───▶│  RENDER       │───▶│  VALIDATE     │
│              │    │               │    │              │    │               │    │               │    │               │
│  python-docx │    │  DocxParser   │    │  BlockNorm   │    │  Jinja2 +     │    │  WeasyPrint   │    │  Page count   │
│  reads .docx │    │  → List[Block]│    │  clean/merge │    │  brand_config │    │  HTML → PDF   │    │  RTL check    │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                │
                                                          brand_config.py
                                                          (colors, fonts,
                                                           spacing — LOCKED)
```

### Data Flow

```
input.docx
    │
    ▼
DocContent {
    doc_type: str          # "מדריך מקצועי", "דף מידע", "חוזר מקצועי"
    title: str             # Main document title
    sections: List[Section]
}

Section {
    title: str
    level: int (1-3)
    blocks: List[ContentBlock]
}

ContentBlock {
    block_type: BlockType  # TITLE | DOC_TYPE | HEADING | PARAGRAPH | BULLET_LIST | TABLE | CALLOUT
    content: Any           # str, List[str], or List[List[str]]
    level: int             # For headings: 1=H1, 2=H2, 3=H3
    metadata: dict         # Optional: inline_bold ranges, original_style, etc.
}
    │
    ▼
HTML string (Jinja2 template + brand_config)
    │
    ▼
WeasyPrint
    │
    ▼
output.pdf
```

### Module Structure

```
content_engine/
├── engine.py              # Main entry point, orchestrates pipeline
├── brand_config.py        # ALL brand constants (colors, fonts, spacing)
├── parser/
│   ├── docx_parser.py     # Stage 2: DOCX → List[ContentBlock]
│   └── normalizer.py      # Stage 3: Block cleanup, merging, validation
├── renderer/
│   ├── html_builder.py    # Stage 4: Blocks → HTML via Jinja2
│   └── pdf_renderer.py    # Stage 5: HTML → PDF via WeasyPrint
├── templates/
│   └── document.html.j2   # Jinja2 HTML/CSS template
├── fonts/
│   ├── Heebo-Regular.ttf
│   ├── Heebo-Medium.ttf
│   ├── Heebo-SemiBold.ttf
│   ├── Heebo-Bold.ttf
│   └── Heebo-Light.ttf
├── assets/
│   └── logo.png           # Official logo (base64-embedded at render time)
└── tests/
    ├── test_doc_1.docx    # Original leasing (short, pandoc-origin — legacy)
    └── test_doc_2.docx    # Full leasing guide (real DOCX — primary test)
```

---

## 3. Brand Enforcement Layer

### brand_config.py — Single Source of Truth

All visual decisions live in one file. No other module contains color codes, font sizes, or spacing values.

```python
BRAND = {
    # ── Colors ──
    "navy":         "#102040",   # Primary — headings, section bars, header bg
    "deep_navy":    "#002040",   # Alt sections, dark backgrounds
    "gold":         "#C0B070",   # Accent ONLY — underlines, callout borders, separator lines
    "gold_light":   "#D0B080",   # Lighter gold variant
    "text_gray":    "#404040",   # Body text
    "muted_gray":   "#808080",   # Footnotes, disclaimers, secondary text
    "light_bg":     "#F7F7F7",   # Off-white page background
    "callout_bg":   "#C0E0E0",   # Callout box background (light blue-gray)
    "white":        "#FFFFFF",
    "table_zebra":  "#F0F4F8",   # Alternating table rows

    # ── Typography ──
    "font_family":  "Heebo",
    "h1_size":      "28pt",      # Range: 26-30pt
    "h1_weight":    "700",
    "h2_size":      "19pt",      # Range: 18-20pt
    "h2_weight":    "700",
    "h3_size":      "15pt",      # Range: 14-16pt
    "h3_weight":    "600",
    "body_size":    "11.5pt",    # Range: 11.5-12.5pt
    "body_weight":  "400",
    "small_size":   "10pt",      # Notes, disclaimers
    "small_weight": "400",
    "line_height":  "1.5",       # Range: 1.45-1.6

    # ── Spacing ──
    "page_margin_top":    "22mm",
    "page_margin_bottom": "18mm",
    "page_margin_left":   "18mm",
    "page_margin_right":  "20mm",   # Slightly wider for RTL logo area
    "section_gap":        "5mm",
    "paragraph_gap":      "3mm",
    "heading_gap_before": "6mm",
    "heading_gap_after":  "2mm",

    # ── Components ──
    "gold_line_width":    "2pt",
    "section_bar_radius": "4pt",
    "callout_border":     "1.5pt",
    "table_border":       "0.5pt",
    "header_height":      "28mm",
    "footer_height":      "12mm",
}
```

### What is Fixed vs. Content-Dependent

| Fixed (brand-locked, never changes per-run) | Content-dependent (read from DOCX) |
|---------------------------------------------|-------------------------------------|
| All colors | Document title text |
| All font sizes and weights | Doc-type label (דף מידע, חוזר מקצועי, etc.) |
| All spacing values | Number of sections |
| Header layout (navy bg, logo right, title center) | Section titles and order |
| Footer layout (gold line, contact info) | Table content and dimensions |
| Section bar styling | Whether callouts exist |
| Table styling (navy header, zebra rows) | Bullet list content |
| Callout box styling | Paragraph text |
| Gold accent usage rules | Number of pages (organic) |

### Gold Usage Rule (Enforced)

Gold (#C0B070) is used ONLY in these locations, never elsewhere:
1. Separator line under header (2pt solid)
2. Separator line above footer (1pt solid)
3. Callout box left border (1.5pt)
4. Title underline accent (optional, 2pt)

Gold never appears in body text, headings, section bars, or table formatting.

---

## 4. Parser Specification

### Input Support Matrix

| Input Type | Supported | Handler |
|-----------|-----------|---------|
| Real DOCX (Word 2007+) | ✅ Primary | python-docx |
| Pandoc-markdown (legacy .docx) | ⚠️ Deprecated | Not supported in v1.5 |
| Plain text / .txt | ❌ | Out of scope |
| PDF | ❌ | Out of scope |
| Google Docs | ❌ | Out of scope (export to DOCX first) |

### Structure Detection Heuristics

The parser operates in a single pass over the document's paragraph and table elements, classifying each into ContentBlocks.

#### Title / Doc-Type Detection (Position-Based)

```
Rule: First 1-3 paragraphs before any section content.
  - Paragraph 0: If bold + short (< 30 chars) → DOC_TYPE ("מדריך מקצועי", "דף מידע")
  - Paragraph 1: If bold → TITLE (main document title)
  - If paragraph 0 is the title directly (no doc-type prefix), mark as TITLE
```

**Validated against test docs:**
- DOC_2 paragraph [0]: "מדריך מקצועי" → DOC_TYPE ✓
- DOC_2 paragraph [1]: "ליסינג מימוני או ליסינג תפעולי או רכישת רכב" → TITLE ✓

#### Section Header Detection (Multi-Signal)

A paragraph is classified as a HEADING (section boundary) if it meets ANY of these criteria:

| Signal | Priority | Rule |
|--------|----------|------|
| Word style | 1 (highest) | Style name starts with "Heading" |
| Bold + short + standalone | 2 | All runs bold AND text length < 60 chars AND followed by non-bold paragraph |
| Numbered pattern | 3 | Matches regex `^\d+\.\s*` |
| Known structural keywords | 4 (fallback) | Text matches common Hebrew section headers (הגדרה, מאפיינים עיקריים, יתרונות, חסרונות) |

**Heading level assignment:**
- Level 1: Major section (ליסינג תפעולי, ליסינג מימוני, רכישת רכב, היבטי מיסוי)
- Level 2: Sub-section within a major section (הגדרה, מאפיינים עיקריים, יתרונות, חסרונות)
- Level 3: Sub-sub-section (rare, used for nested emphasis blocks)

**Level detection logic:**
```
If text matches a known major-section keyword → Level 1
Else if text length < 20 and bold → Level 2
Else if text length < 40 and bold → Level 2
Else → Level 1 (default for ambiguous headers)
```

#### Bullet List Detection

```
Rule: Paragraph is a bullet if:
  - Word style is "List Paragraph" AND text is not bold (bold List Paragraph = heading)
  - OR text starts with bullet marker: •, -, –, ▪, ◦

Consecutive bullets are merged into a single BULLET_LIST block.
Flush (emit) the accumulated list when a non-bullet paragraph is encountered.
```

**Edge case from DOC_2:** "List Paragraph" style is used for BOTH bullets and headings. Disambiguation: if the paragraph is bold and short (< 60 chars), it's a heading, not a bullet.

#### Table Detection

```
Rule: Native Word table objects are iterated separately from paragraphs.
  - Each table produces a TABLE block.
  - First row is assumed to be the header row.
  - All cell text is extracted as strings.
  - Table is inserted into the block list at its document-order position.
```

**Table position tracking:** python-docx provides `document.element.body` which interleaves paragraphs and tables. The parser must iterate this combined stream, not `doc.paragraphs` + `doc.tables` separately, to preserve correct ordering.

#### Callout Detection

```
Rule: Paragraph text contains one of:
  שים לב | חשוב | הערה | שימו לב | לתשומת לב | חשוב לדעת

If triggered, the paragraph (and optionally the next 1-2 related paragraphs) become a CALLOUT block.
```

#### Table of Contents Detection (NEW in v1.5)

```
Rule: A paragraph with text "תוכן עניינים:" followed by a series of
short, non-bold List Paragraph items is a table of contents.
→ SKIP (do not render in output — the PDF does not need a TOC for 2-3 page docs).
```

#### Paragraph (Default)

Everything that doesn't match the above rules becomes a PARAGRAPH block. Inline formatting (bold runs within a paragraph) is preserved as metadata for potential emphasis rendering.

### Explicit Out of Scope (v1.5)

- Images embedded in DOCX → silently skipped
- Nested tables → treated as flat (outer table only)
- Footnotes / endnotes → ignored
- Track changes / comments → ignored
- Multi-column source layouts → treated as single-column
- Headers/footers from source DOCX → ignored (engine applies its own)
- Charts / SmartArt → ignored

### Manual Override Mechanism (Future-Ready)

The parser produces an intermediate JSON representation of all blocks before rendering. This JSON can be:
1. Logged for debugging (always)
2. Inspected by the operator
3. In future: overridden via a sidecar JSON file ("change block at index 5 from PARAGRAPH to HEADING level 2")

This is not implemented in v1.5 but the architecture supports it by keeping parse and render as separate stages.

---

## 5. Normalizer Specification (Stage 3 — NEW)

The normalizer sits between parsing and rendering. It cleans up the raw block list.

### Operations (in order)

| # | Operation | Rule |
|---|-----------|------|
| 1 | Strip empty blocks | Remove any block with empty/whitespace-only content |
| 2 | Merge consecutive bullets | If two adjacent BULLET_LIST blocks exist, merge into one |
| 3 | Attach orphan callouts | If a CALLOUT block is followed by 1-2 short paragraphs, absorb them into the callout content |
| 4 | Skip TOC section | If a DOC_TYPE or heading says "תוכן עניינים", remove it and subsequent list items until next heading |
| 5 | Validate title presence | If no TITLE block exists after parsing, promote the first HEADING to TITLE |
| 6 | Validate doc_type | If no DOC_TYPE block exists, set to empty string (header renders without category label) |
| 7 | Deduplicate headings | If the same heading text appears consecutively (parser artifact), keep only one |

---

## 6. Template Specification (Stage 4)

### Jinja2 Template Structure

The HTML template (`document.html.j2`) produces a complete HTML5 document with embedded CSS. All brand values are injected from `brand_config.py`.

```
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: 'Heebo'; src: url('...'); font-weight: 400; }
    /* ... all weights ... */

    @page {
      size: A4;
      margin: 0;
      @bottom-center {
        content: element(footer);
      }
    }

    body {
      font-family: 'Heebo', sans-serif;
      direction: rtl;
      font-size: {{ brand.body_size }};
      color: {{ brand.text_gray }};
      line-height: {{ brand.line_height }};
    }

    /* Header, section bars, tables, callouts, footer — all use brand.* variables */
  </style>
</head>
<body>
  <header>...</header>
  <main>
    {% for section in content.sections %}
      <div class="section-bar">{{ section.title }}</div>
      {% for block in section.blocks %}
        {% if block.block_type == 'PARAGRAPH' %}
          <p>{{ block.content }}</p>
        {% elif block.block_type == 'BULLET_LIST' %}
          <ul>{% for item in block.content %}<li>{{ item }}</li>{% endfor %}</ul>
        {% elif block.block_type == 'TABLE' %}
          <table>...</table>
        {% elif block.block_type == 'CALLOUT' %}
          <div class="callout">{{ block.content }}</div>
        {% elif block.block_type == 'HEADING' %}
          <h{{ block.level + 1 }}>{{ block.content }}</h{{ block.level + 1 }}>
        {% endif %}
      {% endfor %}
    {% endfor %}
  </main>
  <footer>...</footer>
</body>
</html>
```

### CSS RTL Rules (Non-Negotiable)

Every text-containing element MUST have:
```css
direction: rtl;
text-align: right;
```

Tables additionally need:
```css
table { direction: rtl; }
th, td { text-align: right; }
```

Bullet lists:
```css
ul { padding-right: 20px; padding-left: 0; list-style-position: inside; }
```

### Font Embedding

Heebo font files are embedded via `@font-face` declarations pointing to absolute file paths. WeasyPrint resolves `file://` URLs during PDF generation, embedding the font data into the PDF.

```css
@font-face {
    font-family: 'Heebo';
    src: url('file:///path/to/fonts/Heebo-Regular.ttf');
    font-weight: 400;
}
```

All 5 weights (Light 300, Regular 400, Medium 500, SemiBold 600, Bold 700) are declared.

---

## 7. Output Contract

### What Constitutes a Valid Output

A PDF is considered valid and production-ready if it passes ALL of the following checks:

#### RTL Correctness

| Check | Pass Criteria |
|-------|---------------|
| Hebrew text direction | All Hebrew paragraphs flow right-to-left |
| Bullet alignment | Bullet markers appear on the right side |
| Number rendering | Numbers within Hebrew text (₪, %, dates, parenthesized numbers) display in correct visual order |
| Table column order | Rightmost column is the first semantic column |
| Mixed-direction text | English words/numbers within Hebrew sentences render correctly (automatic bidi) |
| Parentheses | Opening/closing parentheses are not reversed |

#### Typography

| Check | Pass Criteria |
|-------|---------------|
| Font | All text rendered in Heebo (no fallback to system fonts) |
| Size hierarchy | H1 visually larger than H2, H2 larger than H3, H3 larger than body |
| Consistency | Same block type always renders at the same size across pages |
| Readability | Body text at 11.5pt with 1.5 line-height is comfortable to read |

#### Layout

| Check | Pass Criteria |
|-------|---------------|
| Header | Page 1 has navy header with logo (top-right), doc-type label, and title |
| Footer | Every page has gold separator line + firm contact info |
| Section bars | Navy rounded-corner bars with white text for each major section |
| Tables | Navy header row (white text), zebra body rows, proper RTL alignment |
| Callout boxes | Visually distinct from body text (background + border) |
| Margins | Content does not touch page edges; consistent whitespace |
| No overflow | No text or table extends beyond page margins |
| No empty pages | No blank pages in the output |

#### Page Break Logic

| Rule | Implementation |
|------|---------------|
| No orphan headings | CSS `break-after: avoid` on section bars and headings |
| Tables stay together | CSS `break-inside: avoid` on tables (if < 80% page height) |
| Callouts stay together | CSS `break-inside: avoid` on callout boxes |
| Target length | ≤ 4 pages for full guide, ≤ 2 pages for "דף מידע" short circular |

---

## 8. v8 → v1.5 Migration

### What Changes

| Component | Change | Risk |
|-----------|--------|------|
| Parser input handling | Pandoc-markdown → real DOCX via python-docx | Medium — new code, but python-docx is well-tested |
| Font | Noto Sans Hebrew → Heebo | Low — font swap in CSS, download from Google Fonts |
| Template engine | String concatenation → Jinja2 | Low — same HTML output, cleaner authoring |
| Brand config | Inline constants → centralized module | Low — values unchanged, just relocated |
| Normalizer | Did not exist → new stage | Low — additive, doesn't break existing flow |
| Section detection | Hardcoded title list → generalized heuristics | Medium — must validate against both test docs |

### What Is Preserved (Do Not Touch)

| Component | Reason |
|-----------|--------|
| WeasyPrint as PDF renderer | Proven Hebrew RTL handling, non-negotiable |
| HTML/CSS as intermediate format | Native RTL via CSS `direction: rtl` |
| BlockType enum (TITLE, HEADING, PARAGRAPH, etc.) | Clean abstraction, works well |
| Overall page structure (header → content → footer) | Matches brand guide |
| Color values (#102040, #C0B070, etc.) | Brand-locked |
| Logo embedding via base64 | Reliable, no external file dependencies in PDF |

### Migration Sequence

1. Set up module structure and `brand_config.py`
2. Download and bundle Heebo fonts
3. Build Jinja2 template (port CSS from v8 string-based HTML)
4. Build new `docx_parser.py` against `example_doc_2.docx`
5. Build `normalizer.py`
6. Wire pipeline in `engine.py`
7. Run against both test documents
8. Visual comparison against v8 output
9. Deliver

---

## 9. QA Protocol

### Test Matrix

| Test | Input | Expected Outcome | Pass if... |
|------|-------|-------------------|------------|
| T1: Primary doc | `example_doc_2.docx` | 2-4 page branded PDF | Hebrew correct, all sections present, tables render |
| T2: Regression | Content matching v8 input | Output quality ≥ v8 | Side-by-side comparison shows no regression |
| T3: Font embedding | Open PDF on fresh system | Text renders correctly | No tofu boxes, no font substitution |
| T4: Empty section | DOCX with empty paragraph | No crash, graceful skip | Engine produces PDF without error |
| T5: No tables | DOCX with no tables | Clean text-only PDF | No empty table artifacts |

### Acceptance Criteria (Partner-Facing)

Avi and Ron will accept the output if:

1. **It looks professional** — comparable to the firm's existing branded materials
2. **Hebrew is perfect** — no visual artifacts, reversed text, or broken characters
3. **Content is faithful** — every word from the DOCX appears in the PDF, unchanged
4. **Brand is recognizable** — navy/gold/white palette, logo present, conservative layout
5. **It's readable** — clear hierarchy, generous spacing, no cramped text

### Rejection Triggers (Instant Fail)

- Garbled or reversed Hebrew text
- Missing or misplaced logo
- Wrong colors (anything that doesn't match the brand palette)
- Content truncation or omission
- AI-generated or rewritten text (engine is a formatter, not a writer)
- Unprofessional appearance (cluttered, misaligned, "cheap" feeling)

---

## 10. Structural Analysis of Test Documents

### DOC_2 (example_doc_2.docx) — Primary Test Input

```
File type:     Microsoft Word 2007+ (genuine DOCX)
Paragraphs:    190 total, 160 non-empty
Tables:        1 (13 rows × 4 columns — comparison matrix)
Styles used:   {Normal, List Paragraph}  (NO Word heading styles)
Bold paras:    ~35 (used for section headers AND sub-labels)
```

**Document structure map:**
```
[0]  DOC_TYPE   "מדריך מקצועי"
[1]  TITLE      "ליסינג מימוני או ליסינג תפעולי או רכישת רכב"
[4]  SKIP       "תוכן עניינים:" (TOC — do not render)
[5-14] SKIP     TOC items (List Paragraph, non-bold)
[22] HEADING-1  "ליסינג תפעולי"
[23] HEADING-2  "הגדרה"
[25] HEADING-2  "מאפיינים עיקריים"
[31] HEADING-2  "יתרונות"
[35] HEADING-2  "חסרונות"
[41] HEADING-1  "ליסינג מימוני"
[42] HEADING-2  "הגדרה"
... (repeating pattern)
[63] HEADING-1  "רכישת רכב"
[~85] TABLE     13×4 comparison matrix
[89] HEADING-1  "חישוב עלויות"
[96] HEADING-1  "היבטי מיסוי בחברות"
[115] HEADING-1 "היבטי מיסוי בעצמאים"
[134] HEADING-1 "דגשים נוספים"
[145] HEADING-1 "סוגיות מע\"מ..."
[176] HEADING-1 "הרחבות"
```

**Key parsing challenges:**
- No Word heading styles used — all detection must be heuristic (bold + length)
- "List Paragraph" style is overloaded — used for both bullets AND headings
- Table position must be determined by document element order, not paragraph index
- TOC section must be detected and skipped
- Sub-headers repeat across sections (הגדרה, יתרונות, חסרונות) — heading level must be inferred from context

### DOC_1 (Input_DOC_Leasing_Car.docx) — Legacy Input

```
File type:     Pandoc-exported markdown (NOT a real DOCX)
Format:        Markdown with {dir="rtl"} attributes and {=html} blocks
```

**Status:** This file cannot be parsed by python-docx. It was the v8 test input but is now deprecated. If the partners have the original Word version of this file, it should be used instead. Otherwise, DOC_2 covers the same content in greater detail.

---

## 11. Open Items (Resolved)

| Item | Decision | Rationale |
|------|----------|-----------|
| Font | Heebo | Brand guide preference; available from Google Fonts for free |
| Second test document | `example_doc_2.docx` | Real DOCX, 190 paragraphs, 1 table, rich structure |
| Rendering engine | WeasyPrint | Proven in v8, non-negotiable |
| Template approach | Jinja2 | Separates HTML structure from brand config cleanly |
| Legacy Pandoc input | Deprecated | Partners will provide real DOCX files going forward |

**Remaining non-blocking items (addressed during implementation):**
- Heebo font file download and bundling (5-minute task, Google Fonts API)
- Exact footer contact text (use placeholder, partners will provide final text)
- Whether page numbers are desired (default: no; easy to add via CSS `@page` counter)

---

## 12. Implementation Handoff Specification

### For Claude Code (or implementation session)

**Build order (strict sequence):**

1. `brand_config.py` — copy constants from Section 3 above
2. Download Heebo fonts (all 5 weights) from Google Fonts → `fonts/` directory
3. `templates/document.html.j2` — port v8 CSS, replace hardcoded values with Jinja2 variables from brand_config
4. `parser/docx_parser.py` — implement against DOC_2 structure map (Section 10), using heuristics from Section 4
5. `parser/normalizer.py` — implement 7 operations from Section 5
6. `renderer/html_builder.py` — load Jinja2 template, inject blocks + brand config
7. `renderer/pdf_renderer.py` — WeasyPrint call (trivial wrapper)
8. `engine.py` — wire stages 1-6, CLI interface
9. Run against `example_doc_2.docx`, verify output
10. Visual comparison, iterate if needed

**Critical implementation notes:**

- Use `doc.element.body` iteration (not `doc.paragraphs`) to preserve table position ordering
- The TOC section (paragraphs 4-14 in DOC_2) must be detected and skipped — do NOT render a table of contents in the PDF
- Bold "List Paragraph" items are HEADINGS, not bullets — this is the primary disambiguation challenge
- Heebo font files must be bundled in the repo, not fetched at runtime
- The Jinja2 template should produce a single self-contained HTML file (no external dependencies except font files)
- The `--break-system-packages` flag is required for pip installs in this environment

**Dependencies:**
```
python-docx
weasyprint
jinja2
```

---

## 13. Completion Criteria

This architecture report is complete and implementation-ready when:

- [x] Pipeline stages defined and sequenced
- [x] Block model specified (types, structure, content)
- [x] Brand config centralized and locked
- [x] Parser heuristics documented with test-doc validation
- [x] Normalizer operations specified
- [x] Template structure defined (Jinja2 + CSS)
- [x] Output contract defined (RTL, typography, layout, page breaks)
- [x] QA protocol and acceptance criteria established
- [x] Both test documents analyzed
- [x] Migration path from v8 documented
- [x] All blocking questions resolved
- [x] Implementation handoff spec written

**This document is the single source of truth for Content Engine v1.5 implementation.**
No additional planning is required. Proceed directly to build.
