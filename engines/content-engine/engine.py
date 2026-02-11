"""
Content Engine v1.5 — Main entry point.

Orchestrates the 6-stage pipeline:
  1. Ingest  — read DOCX file
  2. Parse   — DOCX → List[ContentBlock]
  3. Normalize — clean, merge, validate blocks
  4. Template — blocks → HTML via Jinja2 + brand_config
  5. Render  — HTML → PDF via Chromium
  6. Validate — basic output checks

Usage:
    python -m engines.content-engine.engine input.docx [output.pdf]
    python engines/content-engine/engine.py input.docx [output.pdf]
"""

import json
import os
import sys
import time

# Ensure the engine package is importable.
# The directory is "content-engine" (hyphenated) which can't be a Python package name,
# so we add the engine dir itself to sys.path for direct sub-package imports.
_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
if _ENGINE_DIR not in sys.path:
    sys.path.insert(0, _ENGINE_DIR)

from parser.docx_parser import parse_docx, BlockType
from parser.normalizer import normalize
from renderer.html_builder import build_html
from renderer.pdf_renderer import render_pdf
import brand_config


def run_pipeline(input_path: str, output_path: str, debug: bool = False) -> str:
    """
    Run the full DOCX → PDF pipeline.

    Args:
        input_path: Path to the input .docx file.
        output_path: Path for the output .pdf file.
        debug: If True, write intermediate JSON and HTML files.

    Returns:
        Path to the generated PDF.
    """
    print(f"[engine] Input:  {input_path}")
    print(f"[engine] Output: {output_path}")

    # ── Stage 1: Ingest ──
    t0 = time.time()
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")
    print(f"[stage 1/6] Ingest — OK ({os.path.getsize(input_path):,} bytes)")

    # ── Stage 2: Parse ──
    t1 = time.time()
    blocks = parse_docx(input_path)
    print(f"[stage 2/6] Parse — {len(blocks)} blocks ({time.time() - t1:.2f}s)")

    if debug:
        debug_dir = os.path.dirname(output_path) or "."
        blocks_json = os.path.join(debug_dir, "debug_blocks_raw.json")
        _write_blocks_json(blocks, blocks_json)
        print(f"  → raw blocks: {blocks_json}")

    # ── Stage 3: Normalize ──
    t2 = time.time()
    blocks = normalize(blocks)
    print(f"[stage 3/6] Normalize — {len(blocks)} blocks ({time.time() - t2:.2f}s)")

    if debug:
        blocks_json = os.path.join(debug_dir, "debug_blocks_normalized.json")
        _write_blocks_json(blocks, blocks_json)
        print(f"  → normalized blocks: {blocks_json}")

    # ── Stage 4: Template ──
    t3 = time.time()
    html = build_html(blocks)

    if not brand_config.fonts_available():
        print("  ⚠ Heebo fonts not found — using system fallback")
        print(f"    Run: bash {os.path.join(_ENGINE_DIR, 'download_fonts.sh')}")

    print(f"[stage 4/6] Template — {len(html):,} chars HTML ({time.time() - t3:.2f}s)")

    if debug:
        html_path = os.path.join(debug_dir, "debug_output.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  → HTML: {html_path}")

    # ── Stage 5: Render ──
    t4 = time.time()
    result_path = render_pdf(html, output_path)
    pdf_size = os.path.getsize(result_path) if os.path.isfile(result_path) else 0
    print(f"[stage 5/6] Render — {pdf_size:,} bytes ({time.time() - t4:.2f}s)")

    # ── Stage 6: Validate ──
    t5 = time.time()
    _validate(result_path)
    print(f"[stage 6/6] Validate — OK ({time.time() - t5:.2f}s)")

    total = time.time() - t0
    print(f"\n[engine] Done in {total:.2f}s → {result_path}")
    return result_path


def _validate(pdf_path: str):
    """Basic output validation."""
    if not os.path.isfile(pdf_path):
        raise RuntimeError("PDF file was not created")

    size = os.path.getsize(pdf_path)
    if size < 1000:
        raise RuntimeError(f"PDF suspiciously small: {size} bytes")

    # Check PDF header
    with open(pdf_path, "rb") as f:
        header = f.read(5)
    if header != b"%PDF-":
        raise RuntimeError("Output is not a valid PDF file")


def _write_blocks_json(blocks, path):
    """Serialize blocks to JSON for debugging."""
    data = []
    for b in blocks:
        entry = {
            "type": b.block_type.value,
            "level": b.level,
        }
        if isinstance(b.content, str):
            entry["content"] = b.content
        elif isinstance(b.content, list):
            entry["content"] = b.content
        else:
            entry["content"] = str(b.content)
        data.append(entry)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python engine.py <input.docx> [output.pdf] [--debug]")
        print()
        print("Examples:")
        print("  python engine.py document.docx")
        print("  python engine.py document.docx output.pdf --debug")
        sys.exit(1)

    input_path = sys.argv[1]
    debug = "--debug" in sys.argv

    # Default output path: same name, .pdf extension
    if len(sys.argv) >= 3 and not sys.argv[2].startswith("--"):
        output_path = sys.argv[2]
    else:
        base = os.path.splitext(os.path.basename(input_path))[0]
        output_dir = os.path.join(_ENGINE_DIR, "output")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{base}.pdf")

    try:
        run_pipeline(input_path, output_path, debug=debug)
    except Exception as e:
        print(f"\n[engine] ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
