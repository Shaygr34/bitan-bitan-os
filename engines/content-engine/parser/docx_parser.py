"""
Stage 2: DOCX → List[ContentBlock]

Parses real DOCX files (Word 2007+) using only stdlib (zipfile + xml.etree).
Classifies paragraphs into block types using heuristic rules from the
architecture spec (Section 4).
"""

import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ── OOXML namespaces ──

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}

W = NS["w"]


def _w(tag: str) -> str:
    """Expand shorthand to full namespace URI."""
    return f"{{{W}}}{tag}"


# ── Block model ──


class BlockType(Enum):
    TITLE = "TITLE"
    DOC_TYPE = "DOC_TYPE"
    HEADING = "HEADING"
    PARAGRAPH = "PARAGRAPH"
    BULLET_LIST = "BULLET_LIST"
    TABLE = "TABLE"
    CALLOUT = "CALLOUT"


@dataclass
class ContentBlock:
    block_type: BlockType
    content: Any  # str, List[str], or List[List[str]]
    level: int = 0
    metadata: dict = field(default_factory=dict)


# ── Known structural keywords ──

MAJOR_SECTION_KEYWORDS = {
    "ליסינג תפעולי",
    "ליסינג מימוני",
    "רכישת רכב",
    "חישוב עלויות",
    "היבטי מיסוי בחברות",
    "היבטי מיסוי בעצמאים",
    "דגשים נוספים",
    "הרחבות",
}

SUB_SECTION_KEYWORDS = {
    "הגדרה",
    "מאפיינים עיקריים",
    "יתרונות",
    "חסרונות",
}

CALLOUT_TRIGGERS = {"שים לב", "חשוב", "הערה", "שימו לב", "לתשומת לב", "חשוב לדעת"}

BULLET_MARKERS = {"•", "-", "–", "▪", "◦"}

NUMBERED_PATTERN = re.compile(r"^\d+\.\s*")

TOC_KEYWORD = "תוכן עניינים"


# ── Paragraph helpers ──


def _get_style_id(para_el: ET.Element) -> str | None:
    """Extract the w:pStyle val from a paragraph."""
    pPr = para_el.find(_w("pPr"))
    if pPr is not None:
        pStyle = pPr.find(_w("pStyle"))
        if pStyle is not None:
            return pStyle.get(_w("val"))
    return None


def _has_numPr(para_el: ET.Element) -> bool:
    """True if paragraph has numbering properties (bullet/numbered list)."""
    pPr = para_el.find(_w("pPr"))
    if pPr is not None:
        numPr = pPr.find(_w("numPr"))
        if numPr is not None:
            numId = numPr.find(_w("numId"))
            if numId is not None and numId.get(_w("val")) != "0":
                return True
    return False


def _extract_runs(para_el: ET.Element) -> list[dict]:
    """Extract runs with text and bold status."""
    runs = []
    for run in para_el.findall(f".//{_w('r')}"):
        rPr = run.find(_w("rPr"))
        is_bold = False
        if rPr is not None:
            if rPr.find(_w("b")) is not None or rPr.find(_w("bCs")) is not None:
                is_bold = True
        t_el = run.find(_w("t"))
        text = t_el.text if t_el is not None and t_el.text else ""
        if text:
            runs.append({"text": text, "bold": is_bold})
    return runs


def _para_text(runs: list[dict]) -> str:
    """Join run texts into full paragraph text."""
    return "".join(r["text"] for r in runs).strip()


def _all_bold(runs: list[dict]) -> bool:
    """True if every run is bold and there's at least one run."""
    return bool(runs) and all(r["bold"] for r in runs)


def _extract_table(tbl_el: ET.Element) -> list[list[str]]:
    """Extract table as list of rows, each row a list of cell strings."""
    rows = []
    for tr in tbl_el.findall(f".//{_w('tr')}"):
        cells = []
        for tc in tr.findall(_w("tc")):
            # Collect all text in the cell
            cell_texts = []
            for p in tc.findall(f".//{_w('p')}"):
                runs = _extract_runs(p)
                t = _para_text(runs)
                if t:
                    cell_texts.append(t)
            cells.append("\n".join(cell_texts))
        rows.append(cells)
    return rows


# ── Heading level detection ──


def _classify_heading_level(text: str) -> int:
    """
    Determine heading level:
      1 = major section  (→ rendered as navy section-bar)
      2 = sub-section    (→ rendered as h3)
    """
    clean = text.rstrip(":").strip()

    # Check against known major keywords — only these get section-bar treatment
    for kw in MAJOR_SECTION_KEYWORDS:
        if clean.startswith(kw):
            return 1

    # Check against known sub-section keywords
    if clean in SUB_SECTION_KEYWORDS:
        return 2

    # Sentence-like text (commas, terminal punctuation) → never a section-bar.
    # These are "key point" sentences, not structural headings.
    if "," in clean or clean.endswith(".") or clean.endswith("?") or clean.endswith("!"):
        return 2

    # Everything else → level 2 (safer default — only known keywords get level 1)
    return 2


# ── Main parser ──


def parse_docx(filepath: str) -> list[ContentBlock]:
    """
    Parse a DOCX file into a flat list of ContentBlocks.

    Uses heuristic rules:
    - Position-based title/doc-type detection (first 1-3 paragraphs)
    - Bold + short = heading
    - List Paragraph + non-bold = bullet
    - Table detection via document element order
    - TOC detection and skipping
    - Callout detection via trigger words
    """
    with zipfile.ZipFile(filepath) as zf:
        doc_xml = zf.read("word/document.xml")

    root = ET.fromstring(doc_xml)
    body = root.find(_w("body"))
    if body is None:
        return []

    blocks: list[ContentBlock] = []
    para_index = 0
    title_found = False
    doc_type_found = False
    in_toc = False
    bullet_accumulator: list[str] = []

    def _flush_bullets():
        nonlocal bullet_accumulator
        if bullet_accumulator:
            blocks.append(ContentBlock(
                block_type=BlockType.BULLET_LIST,
                content=list(bullet_accumulator),
            ))
            bullet_accumulator = []

    for child in body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        # ── TABLE ──
        if tag == "tbl":
            _flush_bullets()
            table_data = _extract_table(child)
            if table_data:
                blocks.append(ContentBlock(
                    block_type=BlockType.TABLE,
                    content=table_data,
                ))
            continue

        if tag != "p":
            continue

        # ── PARAGRAPH processing ──
        style_id = _get_style_id(child)
        runs = _extract_runs(child)
        text = _para_text(runs)
        is_bold = _all_bold(runs)
        has_num = _has_numPr(child)
        is_list_para = style_id in ("ListParagraph", "a") or has_num

        para_index += 1

        # Skip empty paragraphs
        if not text:
            # An empty paragraph breaks a bullet sequence
            if bullet_accumulator:
                _flush_bullets()
            continue

        # ── Title / doc-type detection (position-based, first few paragraphs) ──
        if not title_found and para_index <= 5:
            if not doc_type_found and is_bold and len(text) < 30:
                blocks.append(ContentBlock(
                    block_type=BlockType.DOC_TYPE,
                    content=text,
                ))
                doc_type_found = True
                continue
            if is_bold:
                blocks.append(ContentBlock(
                    block_type=BlockType.TITLE,
                    content=text,
                ))
                title_found = True
                continue

        # ── TOC detection and skipping ──
        if TOC_KEYWORD in text:
            _flush_bullets()
            in_toc = True
            continue

        if in_toc:
            # TOC items are short, List Paragraph, non-bold.
            # TOC ends when we hit a bold paragraph (= first real heading).
            if is_bold and len(text) < 60:
                # Bold heading = end of TOC → fall through to classify
                in_toc = False
            elif is_list_para and not is_bold:
                # Still in TOC — skip
                continue
            elif not text.strip():
                continue
            else:
                # Non-list, non-bold, non-empty paragraph in preamble zone → skip
                if para_index < 30:
                    continue
                in_toc = False

        # ── Callout detection ──
        for trigger in CALLOUT_TRIGGERS:
            if trigger in text:
                _flush_bullets()
                blocks.append(ContentBlock(
                    block_type=BlockType.CALLOUT,
                    content=text,
                ))
                break
        else:
            # ── Heading detection ──
            if is_bold and len(text) < 60:
                _flush_bullets()
                level = _classify_heading_level(text)
                blocks.append(ContentBlock(
                    block_type=BlockType.HEADING,
                    content=text,
                    level=level,
                ))

            # ── Bullet detection ──
            elif is_list_para and not is_bold:
                bullet_accumulator.append(text)

            elif not is_bold and text[0] in BULLET_MARKERS:
                bullet_accumulator.append(text.lstrip("".join(BULLET_MARKERS)).strip())

            # ── Regular paragraph ──
            else:
                _flush_bullets()
                blocks.append(ContentBlock(
                    block_type=BlockType.PARAGRAPH,
                    content=text,
                    metadata={
                        "has_inline_bold": any(r["bold"] for r in runs)
                                           and not all(r["bold"] for r in runs),
                    },
                ))

    # Flush any remaining bullets
    _flush_bullets()

    return blocks
