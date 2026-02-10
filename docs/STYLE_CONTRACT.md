# Style Contract

Implementation rules that enforce the Design Language System in code.

> **Rule**: all PRs touching UI must pass this checklist before merge.

## CSS rules

1. **Use design tokens only** — no hard-coded colors, font sizes, or spacing values. Reference `var(--token-name)` from `globals.css`.
2. **No `!important`** — if you need it, the cascade is wrong. Fix the specificity.
3. **No inline pixel values for layout** — use spacing tokens.
4. **Global styles live in `globals.css`** — component styles use CSS modules or inline style objects with token references.

## Component rules

1. **One component per file** — named export matching the filename.
2. **Props over internal state** — keep components controlled where possible.
3. **No anonymous components** — always use named functions for React DevTools.
4. **Client components must be marked** — `"use client"` at the top when using hooks or browser APIs.

## Naming conventions

| Item | Convention | Example |
|------|-----------|---------|
| Component files | PascalCase | `SideNav.tsx` |
| Route directories | kebab-case | `content-engine/` |
| CSS tokens | `--kebab-case` | `--color-accent` |
| TypeScript types | PascalCase | `NavChannel` |

## File structure

```
src/
  app/           # App Router pages and layouts
  components/    # Shared UI components
  lib/           # Utilities and helpers (when needed)
```

## Enforcement

- CI builds the project — type errors and lint failures block merge.
- PR template includes a design/style compliance checkbox.
- When in doubt, create an explicit `<!-- TODO: ... -->` with your assumption and flag it in the PR description.

<!-- TODO: Add visual regression testing rules when tooling is in place -->
