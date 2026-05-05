# Chromium on Railway — Verification Results

**Date**: 2026-03-05

## Docker Configuration

- **Chromium installed in Docker**: YES — `apk add chromium` in runner stage of `apps/os-hub/Dockerfile`
- **Supporting libraries**: `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-dejavu` (fonts)
- **Puppeteer package**: `puppeteer-core@^24.0.0` (lightweight, no bundled binary)
- **Chromium path candidates**: `$CHROMIUM_PATH`, `/usr/bin/chromium-browser`, `/usr/bin/chromium`

## Launch Configuration

```
Launch args: --no-sandbox, --disable-dev-shm-usage, --disable-gpu,
             --disable-setuid-sandbox, --single-process
User-Agent:  Chrome/124.0.0.0 on Windows 10
Viewport:    1280x800
Headless:    true
```

## Stealth/Anti-Detection

- **puppeteer-extra**: NOT installed
- **puppeteer-extra-plugin-stealth**: NOT installed
- **Anti-detection measures**: Only realistic user-agent and viewport size
- **Resource blocking**: Images, fonts, media, stylesheets blocked via request interception

## Chromium Launches Successfully on Railway: LIKELY YES

Based on code analysis:
- Docker image includes all required system deps (nss, freetype, harfbuzz)
- Launch args are correct for containerized environments
- `--no-sandbox` + `--disable-setuid-sandbox` required since container runs as non-root `nextjs` user
- The singleton pattern and `closeBrowser()` suggest it was designed to work in the Railway Docker environment

## Gov.il Page Loads in Chromium: UNVERIFIED

**Cannot verify remotely** — Railway CLI not installed locally, no SSH access.

To verify, need to either:
1. Check Railway deployment logs for `[BROWSER] Launching Chromium` and `[BROWSER] Gov.il HTML: NNN chars`
2. Trigger a manual poll of a gov.il source via the UI "scan" button
3. Add temporary logging to capture the response status

**Likely outcome**: Chromium will load the page (it can solve Cloudflare JS challenges), but vanilla headless Chromium may be detected by Cloudflare's bot detection. `puppeteer-extra-plugin-stealth` patches multiple browser fingerprinting vectors (navigator.webdriver, chrome.runtime, plugins array, etc.) that Cloudflare checks.

## Recommendation

1. **First**: Deploy this stabilization branch and trigger a gov.il source scan via the UI
2. **Check logs**: Look for `[BROWSER] Gov.il HTML: NNN chars` and `[BROWSER] Gov.il extracted N items`
3. **If 0 items**: Check if HTML contains Cloudflare challenge page (`cf-browser-verification`, `cf_chl_opt`)
4. **If Cloudflare blocked**: Install `puppeteer-extra` + `puppeteer-extra-plugin-stealth` (Session 2, Path B)
5. **If items found but 0 parsed**: Fix `parseGovIlHtml()` field mappings against actual `__NEXT_DATA__` structure

## Next Steps (Session 2)

Regardless of outcome, the stealth plugin is cheap insurance:
```
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```
- Cost: ~50KB bundle size increase
- Benefit: patches 10+ browser fingerprinting vectors Cloudflare checks
- Risk: none — it's a transparent wrapper around puppeteer-core
