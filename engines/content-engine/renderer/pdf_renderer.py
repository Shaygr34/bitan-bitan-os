"""
Stage 5: HTML → PDF via headless Chromium (Playwright).

Uses the Playwright Chromium binary to render the HTML template to PDF.
Falls back to WeasyPrint if available. Produces A4-sized branded PDFs
with correct Hebrew RTL rendering.
"""

import os
import subprocess
import sys
import tempfile

# Chromium binary candidates — prefer headless shell (faster, lighter)
_CHROMIUM_CANDIDATES = [
    os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell"),
    os.path.expanduser("~/.cache/ms-playwright/chromium-1194/chrome-linux/chrome"),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
]


def _find_chromium() -> str | None:
    """Locate the Chromium binary."""
    for path in _CHROMIUM_CANDIDATES:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    # Try 'which'
    try:
        result = subprocess.run(
            ["which", "chromium", "chromium-browser", "google-chrome"],
            capture_output=True, text=True,
        )
        for line in result.stdout.strip().splitlines():
            if os.path.isfile(line.strip()):
                return line.strip()
    except Exception:
        pass

    return None


def _find_any_chromium() -> str | None:
    """Search more broadly for any Playwright-installed Chromium."""
    import glob
    patterns = [
        os.path.expanduser("~/.cache/ms-playwright/*/chrome-linux/chrome"),
        "/root/.cache/ms-playwright/*/chrome-linux/chrome",
    ]
    for pattern in patterns:
        matches = glob.glob(pattern)
        for match in matches:
            if os.path.isfile(match) and os.access(match, os.X_OK):
                return match
    return None


def render_pdf_chromium(html_path: str, output_path: str) -> str:
    """
    Render HTML to PDF using headless Chromium.

    Args:
        html_path: Absolute path to the HTML file.
        output_path: Absolute path for the output PDF.

    Returns:
        Path to the generated PDF.

    Raises:
        RuntimeError: If Chromium is not found or rendering fails.
    """
    chrome = _find_chromium() or _find_any_chromium()
    if not chrome:
        raise RuntimeError(
            "Chromium not found. Install Playwright browsers: playwright install chromium"
        )

    # headless_shell doesn't need --headless flag; full chrome does
    is_headless_shell = "headless_shell" in chrome
    cmd = [chrome]
    if not is_headless_shell:
        cmd.append("--headless=new")
    cmd.extend([
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        f"--print-to-pdf={output_path}",
        "--no-pdf-header-footer",
        f"file://{html_path}",
    ])

    # Clean environment: remove proxy vars that confuse Chromium
    env = dict(os.environ)
    for key in list(env.keys()):
        if "proxy" in key.lower():
            del env[key]
    env["HOME"] = os.path.expanduser("~")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )

    if not os.path.isfile(output_path):
        raise RuntimeError(
            f"PDF generation failed.\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    return output_path


def render_pdf(html_content: str, output_path: str) -> str:
    """
    Main entry point: render HTML string to PDF.

    Writes HTML to a temp file, then uses Chromium to convert to PDF.

    Args:
        html_content: Complete HTML document string.
        output_path: Where to write the PDF.

    Returns:
        Path to the generated PDF.
    """
    # Write HTML next to output file (avoids /tmp permission issues)
    output_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(output_dir, exist_ok=True)
    html_path = os.path.join(output_dir, "_render_temp.html")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    try:
        return render_pdf_chromium(html_path, output_path)
    finally:
        try:
            os.unlink(html_path)
        except OSError:
            pass
