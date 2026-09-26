---
id: "0504"
title: theme-contrast guard silently skips spaced rgba() tokens
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/theme-contrast-guard-silently-skips-spac
created_at: "2026-09-25T17:17:00Z"
updated_at: "2026-09-26T01:05:28Z"
---
Found while registering the gruvbox theme (#0503). Kept out of that task because it
changes the guard's behaviour repo-wide and for every project that configures
`[check] contrastPairs`; it deserves its own review.

## The defect

`parseColor` in `src/commands/check.ts` parses `rgb()`/`rgba()` with:

    /^rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)$/

There is no `\s*` between components, so oxfmt's normal spacing —
`rgba(110, 157, 106, 0.22)` — does not match and `parseColor` returns `null`.

The failure is silent, not loud: in `themeContrastOffenders`, a pair whose fg or bg
produces no candidate colours hits `if (!fgs.length || !bgs.length) continue;` and
is skipped. So a `contrastPairs` background token written as a spaced `rgba()` is
never checked at all. Worse, `colorCandidates` extracts gradient stops with a
looser regex but feeds each to the same `parseColor`, so **spaced `rgba()` stops
inside a gradient are dropped from the candidate list too** — a gradient can be
judged on only the subset of stops that happen to be hex.

## Measured impact on this repo

425 spaced `rgba()` literals in `src/ui-app/src/style.css`; 1 unspaced. Pairs left
silently unchecked, per theme:

| theme              | unchecked pairs |
| ------------------ | --------------- |
| classic-dark/light | 6 of 9 (both button gradients, status-on, tag-stream, tag-reconnect, doc-row-sel) |
| clear-dark/light   | 5 of 9 |
| gen-z-dark/light   | 6 of 9 |
| jelly-dark/light   | 6 of 9 |
| gruvbox-dark/light | 4 of 9 (tag-stream, tag-reconnect, doc-row-sel, nav-active) |

So the guard's green run on this repo has been checking meaningfully less than it
reports. Notably `:root`'s own `--ai-chat-send-bg` is already being dropped today,
because the `/* AI chat send button (#0444) … *\/` comment above it (in `style.css`)
corrupts the key — see the separate comment-interior hazard documented on
`CheckThemeScope` in `src/core/types.ts`.

## The fix

Add `\s*` after each separator in both the anchored `parseColor` match and the
gradient-stop extraction in `colorCandidates`.

## Already verified

Measured by patching the regex and re-running the real guard against the real
`style.css` + `repoos.toml`: **zero offenders** — all five themes genuinely pass
all 9 configured pairs once the colours parse. The fix only strengthens the gate;
it does not newly fail any existing theme. It should be accompanied by a test that
a spaced `rgba()` token *is* evaluated (today a deliberately-broken
`--tag-stream-color` in gruvbox-dark passes silently, which is how this was found).

## Activity

- 2026-09-25T17:17:00Z · created · unknown
- 2026-09-26T01:02:31Z · status inbox→ready
- 2026-09-26T01:02:52Z · status ready→active, branch
- 2026-09-26T01:05:28Z · status active→review
