# Design Language System

Canonical design tokens, components, and patterns for all Bitan & Bitan UI.

> **Rule**: every UI element in this repo must reference a token or component defined here. No ad-hoc values.

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#fafafa` | Page background |
| `--color-nav-bg` | `#111` | Sidebar background |
| `--color-nav-text` | `#ccc` | Sidebar text |
| `--color-nav-active` | `#fff` | Active nav item |
| `--color-nav-hover-bg` | `#222` | Nav hover state |
| `--color-accent` | `#3b82f6` | Primary accent / links |
| `--color-text` | `#111` | Body text |
| `--color-muted` | `#666` | Secondary text |

<!-- TODO: Add full color palette when brand guide is finalized -->

## Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | `system-ui, -apple-system, sans-serif` | All body text |
| `--font-size-h1` | `2rem` | Page headings |
| `--font-size-body` | `1rem` | Body copy |

<!-- TODO: Add type scale, weights, line-heights -->

## Spacing

| Token | Value |
|-------|-------|
| `--space-xs` | `0.25rem` |
| `--space-sm` | `0.5rem` |
| `--space-md` | `1rem` |
| `--space-lg` | `1.5rem` |
| `--space-xl` | `2rem` |

<!-- TODO: Define spacing scale -->

## Components

### SideNav

- Fixed left sidebar, width `var(--nav-width)` (240px).
- Dark background (`--color-nav-bg`), light text.
- Active state: bold white text, subtle background highlight.

### Page layout

- Main content offset by `var(--nav-width)`, padded `var(--space-xl)`.

<!-- TODO: Add card, button, form, table component specs -->

## Iconography

<!-- TODO: Define icon set and usage rules -->

## Responsive breakpoints

<!-- TODO: Define breakpoints once mobile is in scope -->
