# Founder Console — Bitan Website

## What is it?

A dedicated page inside **OS Hub** (`/bitan-website`) that gives founders (Avi, Ron, Shay) a single place to manage the Bitan website.

**Current scope (Phase A+B):** link-out only — buttons open external services in a new tab.

## Page structure

| Section | Description |
|---------|-------------|
| **Quick Actions** | Three cards linking to: Website (staging), Sanity Studio, GA4 Realtime |
| **Status** | Basic availability check for the website (server-side HEAD request) |
| **Resources** | Placeholder for future links (GitHub, Railway, etc.) |

## How to update links

All external URLs are centralized in:

```
apps/os-hub/src/config/integrations.ts
```

Each URL can be overridden with environment variables:

| Env var | Default |
|---------|---------|
| `NEXT_PUBLIC_BITAN_WEBSITE_URL` | `https://bitan-bitan-website-production.up.railway.app/` |
| `NEXT_PUBLIC_BITAN_STUDIO_URL` | `https://bitan-bitan-website-production.up.railway.app/studio` |
| `NEXT_PUBLIC_BITAN_GA4_URL` | GA4 realtime dashboard URL |
| `BITAN_WEBSITE_HEALTH_URL` | `https://bitan-bitan-website-production.up.railway.app` |

To change a URL:
1. Set the env var in Railway (recommended), or
2. Edit the default in `integrations.ts` and redeploy.

## Health check

The health check runs server-side via `/api/bitan-website/health` to avoid CORS issues. It sends a HEAD request to the website root and returns `{ status: "up" | "down", responseMs }`.

## What's coming next

- **Analytics embedding** — GA4 embed inside OS Hub (pending auth)
- **Content intake** — form in OS Hub → Sanity draft (via Sanity API)
- **Auth/roles** — restrict pages per founder role
- **Resource links** — GitHub repo, Railway dashboard, deployment logs
