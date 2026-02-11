"""
Stage 4: Blocks → HTML via Jinja2.

Loads the document template, injects brand config and content blocks,
and produces a self-contained HTML string ready for PDF rendering.
"""

import base64
import os

from jinja2 import Environment, FileSystemLoader

import sys
_RENDERER_DIR = os.path.dirname(os.path.abspath(__file__))
_ENGINE_DIR = os.path.dirname(_RENDERER_DIR)
if _ENGINE_DIR not in sys.path:
    sys.path.insert(0, _ENGINE_DIR)

from brand_config import BRAND, LOGO_PATH, get_font_paths
from parser.docx_parser import BlockType, ContentBlock


_TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates")


def _load_logo_base64() -> str:
    """Read the logo file and return base64-encoded data."""
    if not os.path.isfile(LOGO_PATH):
        return ""
    with open(LOGO_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def build_html(
    blocks: list[ContentBlock],
    title: str = "",
    doc_type: str = "",
) -> str:
    """
    Render blocks into a full HTML document using the Jinja2 template.

    Args:
        blocks: Normalized list of ContentBlocks (TITLE and DOC_TYPE
                blocks are extracted separately for the header).
        title: Document title text.
        doc_type: Document type label (e.g. "מדריך מקצועי").

    Returns:
        Complete HTML string.
    """
    env = Environment(
        loader=FileSystemLoader(_TEMPLATES_DIR),
        autoescape=False,
    )
    template = env.get_template("document.html.j2")

    # Extract title and doc_type from blocks if not provided
    render_blocks = []
    for b in blocks:
        if b.block_type == BlockType.TITLE and not title:
            title = b.content
        elif b.block_type == BlockType.DOC_TYPE and not doc_type:
            doc_type = b.content
        else:
            render_blocks.append(b)

    # Build font-face entries
    font_faces = []
    font_paths = get_font_paths()
    for weight, path in sorted(font_paths.items()):
        font_faces.append((weight, path))

    html = template.render(
        brand=BRAND,
        blocks=render_blocks,
        title=title,
        doc_type=doc_type,
        logo_base64=_load_logo_base64(),
        font_faces=font_faces,
    )

    return html
