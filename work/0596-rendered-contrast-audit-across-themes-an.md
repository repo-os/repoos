---
id: "0596"
title: Rendered contrast audit across themes and screens (+ hardcoded-color source guard)
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/rendered-contrast-audit-across-themes-an
model_override: opencode-go/mimo-v2.6-flash
review_model_override: opencode-go/hy3
created_at: "2026-09-30T03:04:34Z"
updated_at: "2026-09-30T06:01:00Z"
review_passes: 1
---
## Problem
The theme-contrast check (`[[check.contrastPairs]]` in repoos.toml) only tests 9 named token pairs per theme scope, so it cannot see a component that hard-codes its own colors. Example (fixed on main): the task drawer's Changes tab file header set `background: rgba(255,255,255,0.04)` and `color: #c9d1d9` in a scoped style block, overriding the token-based rules in style.css. It was near-white on near-white in light themes and went unnoticed. Other themes/modes and screens likely have the same class of bug (a first grep found ~8 translucent-white backgrounds and ~6 hard-coded light text colors in components/views; some are intentional, e.g. the dark code panes).

## Approach
1. **Rendered audit** in the existing headless WebKit smoke harness (scripts/ui-smoke.mjs):
   - For every theme scope x light/dark, open a defined set of screens/states: board, drawer tabs (Changes, Tokens, Review, chat), Agents, Settings, Context/Docs, a modal or two, toasts.
   - Walk every visible text node; read computed `color`; find the real background by compositing translucent ancestor backgrounds down to the first opaque one (skip elements with images/gradients behind them, report them as "unchecked").
   - Fail text under 3:1 (large/UI text) or 4.5:1 (body text). Report theme, mode, screen, selector, fg/bg and ratio.
   - Allowlist mechanism for intentionally dark blocks (code panes) via a data attribute or selector list in repoos.toml, not scattered ignores.
2. **Source guard**: flag new hard-coded `#hex` / `rgba(255,...)` colors in component `<style>` blocks unless annotated with a marker comment. Prevents regressions; the rendered audit finds what is already there.
3. Wire both into `repoos.toml` `[[check.steps]]` (full profile; consider `whenChanged` on `src/ui-app/**`), and document in user-docs/check.md and docs/.

## Acceptance
- Audit runs over all theme scopes in both modes, reports offenders with actionable detail, and exits non-zero on failures.
- Re-introducing the Changes-tab header bug (hard-coded light text on a light header) makes the audit fail.
- Existing offenders are either fixed or explicitly allowlisted with a reason (triage findings in this task; file follow-ups for large clusters).
- Runs in a reasonable time budget (state the measured runtime in the handoff).

## Activity

- 2026-09-30T03:04:34Z · created · unknown
- 2026-09-30T03:27:41Z · model_override
- 2026-09-30T03:27:48Z · review_model_override
- 2026-09-30T03:27:49Z · status inbox→ready
- 2026-09-30T03:27:50Z · status ready→active, branch
- 2026-09-30T05:18:05Z · status active→review
- 2026-09-30T06:01:00Z · status review→done, release:success
