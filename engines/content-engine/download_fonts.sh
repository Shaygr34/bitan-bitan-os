#!/usr/bin/env bash
# Download Heebo font files from Google Fonts.
# Run this once in an environment with internet access.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FONTS_DIR="$SCRIPT_DIR/fonts"

mkdir -p "$FONTS_DIR"

WEIGHTS=("300:Light" "400:Regular" "500:Medium" "600:SemiBold" "700:Bold")
BASE_URL="https://github.com/googlefonts/heebo/raw/main/fonts/ttf"

echo "Downloading Heebo fonts to $FONTS_DIR ..."

for entry in "${WEIGHTS[@]}"; do
    weight="${entry%%:*}"
    name="${entry##*:}"
    filename="Heebo-${name}.ttf"
    target="$FONTS_DIR/$filename"

    if [ -f "$target" ]; then
        echo "  ✓ $filename already exists"
        continue
    fi

    echo "  ↓ $filename (weight $weight)"
    curl -fsSL "$BASE_URL/$filename" -o "$target" 2>/dev/null || \
    curl -fsSL "https://raw.githubusercontent.com/googlefonts/heebo/main/fonts/ttf/$filename" -o "$target" 2>/dev/null || \
    {
        echo "  ✗ Failed to download $filename — trying Google Fonts API..."
        # Fallback: download the whole family zip
        TMP_ZIP="/tmp/heebo-fonts.zip"
        curl -fsSL "https://fonts.google.com/download?family=Heebo" -o "$TMP_ZIP" 2>/dev/null && \
        unzip -o "$TMP_ZIP" -d "/tmp/heebo-extract" 2>/dev/null && \
        find /tmp/heebo-extract -name "*.ttf" -exec cp {} "$FONTS_DIR/" \; && \
        rm -rf "$TMP_ZIP" /tmp/heebo-extract && \
        echo "  ✓ Extracted from family zip" && \
        break
    }
done

echo ""
echo "Font status:"
for entry in "${WEIGHTS[@]}"; do
    name="${entry##*:}"
    filename="Heebo-${name}.ttf"
    if [ -f "$FONTS_DIR/$filename" ]; then
        echo "  ✓ $filename"
    else
        echo "  ✗ $filename MISSING"
    fi
done
