# os-hub

Central dashboard and orchestration layer for bitan-bitan-os. Built with Next.js 14+ (App Router) and TypeScript.

## Setup

```bash
# From repo root
pnpm install
```

## Development

```bash
pnpm dev:os-hub      # Start dev server
pnpm build:os-hub    # Production build
pnpm start:os-hub    # Start production server
pnpm lint            # Run ESLint
```

## Structure

```
src/
  app/
    layout.tsx         # Root layout with sidebar navigation
    page.tsx           # Landing page
    globals.css        # Global styles
    sumit-sync/
      page.tsx         # Sumit Sync channel page
    content-engine/
      page.tsx         # Content Engine channel page
  components/
    SideNav.tsx        # Left navigation sidebar
```
