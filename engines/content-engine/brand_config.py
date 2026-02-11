"""
Brand configuration — single source of truth for all visual constants.
No other module should contain color codes, font sizes, or spacing values.
"""

import os

# Resolve paths relative to this file
_ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(_ENGINE_DIR, "fonts")
ASSETS_DIR = os.path.join(_ENGINE_DIR, "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "background less logo.png")
HEADER_IMAGE_PATH = os.path.join(ASSETS_DIR, "ביטן את ביטן - לוגו ראשי A4.jpg")
FOOTER_IMAGE_PATH = os.path.join(ASSETS_DIR, "ביטן את ביטן - לוגו תחתית דף A4.jpg")

BRAND = {
    # ── Colors ──
    "navy":         "#102040",
    "deep_navy":    "#002040",
    "gold":         "#C0B070",
    "gold_light":   "#D0B080",
    "text_gray":    "#404040",
    "muted_gray":   "#808080",
    "light_bg":     "#F7F7F7",
    "callout_bg":   "#C0E0E0",
    "white":        "#FFFFFF",
    "table_zebra":  "#F0F4F8",

    # ── Typography ──
    "font_family":  "Heebo",
    "font_fallback": "DejaVu Sans, FreeSans, Arial, sans-serif",
    "h1_size":      "28pt",
    "h1_weight":    "700",
    "h2_size":      "19pt",
    "h2_weight":    "700",
    "h3_size":      "15pt",
    "h3_weight":    "600",
    "body_size":    "11.5pt",
    "body_weight":  "400",
    "small_size":   "10pt",
    "small_weight": "400",
    "line_height":  "1.5",

    # ── Spacing ──
    "page_margin_top":    "22mm",
    "page_margin_bottom": "18mm",
    "page_margin_left":   "18mm",
    "page_margin_right":  "20mm",
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
    "footer_height":      "18mm",
}

# Font weight → file mapping
FONT_WEIGHTS = {
    "300": "Heebo-Light.ttf",
    "400": "Heebo-Regular.ttf",
    "500": "Heebo-Medium.ttf",
    "600": "Heebo-SemiBold.ttf",
    "700": "Heebo-Bold.ttf",
}


def get_font_paths():
    """Return dict of weight → absolute path for available font files."""
    paths = {}
    for weight, filename in FONT_WEIGHTS.items():
        full = os.path.join(FONTS_DIR, filename)
        if os.path.isfile(full):
            paths[weight] = full
    return paths


def fonts_available():
    """Return True if at least the Regular weight is bundled."""
    return os.path.isfile(os.path.join(FONTS_DIR, "Heebo-Regular.ttf"))
