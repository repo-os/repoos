---
id: 1046
title: "# Diff view: only highlight with the active light/dark th…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-11-06T23:18:09Z"
updated_at: "2026-11-06T23:18:09Z"
---
# Diff view: only highlight with the active light/dark theme pair

## Why
`src/ui-app/src/lib/syntax-highlight.ts` (`highlightPair`, used by `DiffView.vue`) currently asks Shiki for all four themes at once (GitHub light/dark + Catppuccin Latte/Mocha) so CSS can switch themes without re-highlighting. Shiki does a colour pass per theme, so every diff costs ~4 passes even though only one is visible. A local benchmark showed 4 themes → 2 themes roughly halves highlight time (db.ts, 1,859 lines: 914 ms → 483 ms).

## What to do
1. Make `highlightPair` take the active theme family (GitHub or Catppuccin) and only request that family's light + dark themes from Shiki.
2. Keep the light/dark switch instant: tokens still carry both light and dark colours via the existing CSS custom properties, and `style.css` still picks one off `[data-theme]`.
3. When the user switches theme family (`data-ui-theme`, e.g. GitHub → Catppuccin) while a diff is open, re-highlight the open diff with the new pair. Only load the new family's theme modules lazily, when first needed.
4. Cache highlighted output per (file pair, theme family) so switching back doesn't re-highlight.
5. Keep everything else as-is: lazy grammar loading, the size ceiling with plain-text fallback, and HTML escaping of untrusted content.

## Done when
- Opening a diff loads and applies only 2 themes (verify in tests and in the network panel/lazy chunks).
- Light ↔ dark toggle updates colours with no re-highlight.
- Theme family switch re-highlights the open diff once with correct colours, and switching back uses the cache.
- Existing tests pass (`syntax-highlight.test.ts`, `catppuccin-theme.test.ts`, the DiffView tests), and new tests cover the family switch and the cache.
- A before/after timing for a large TS file is in the PR description (expect roughly 2× faster).
- No visual changes in any of the four themes.

## Original prompt

# Diff view: only highlight with the active light/dark theme pair

## Why
`src/ui-app/src/lib/syntax-highlight.ts` (`highlightPair`, used by `DiffView.vue`) currently asks Shiki for all four themes at once (GitHub light/dark + Catppuccin Latte/Mocha) so CSS can switch themes without re-highlighting. Shiki does a colour pass per theme, so every diff costs ~4 passes even though only one is visible. A local benchmark showed 4 themes → 2 themes roughly halves highlight time (db.ts, 1,859 lines: 914 ms → 483 ms).

## What to do
1. Make `highlightPair` take the active theme family (GitHub or Catppuccin) and only request that family's light + dark themes from Shiki.
2. Keep the light/dark switch instant: tokens still carry both light and dark colours via the existing CSS custom properties, and `style.css` still picks one off `[data-theme]`.
3. When the user switches theme family (`data-ui-theme`, e.g. GitHub → Catppuccin) while a diff is open, re-highlight the open diff with the new pair. Only load the new family's theme modules lazily, when first needed.
4. Cache highlighted output per (file pair, theme family) so switching back doesn't re-highlight.
5. Keep everything else as-is: lazy grammar loading, the size ceiling with plain-text fallback, and HTML escaping of untrusted content.

## Done when
- Opening a diff loads and applies only 2 themes (verify in tests and in the network panel/lazy chunks).
- Light ↔ dark toggle updates colours with no re-highlight.
- Theme family switch re-highlights the open diff once with correct colours, and switching back uses the cache.
- Existing tests pass (`syntax-highlight.test.ts`, `catppuccin-theme.test.ts`, the DiffView tests), and new tests cover the family switch and the cache.
- A before/after timing for a large TS file is in the PR description (expect roughly 2× faster).
- No visual changes in any of the four themes.

## Activity

- 2026-11-06T23:18:09Z · created · hello@repoos.org
