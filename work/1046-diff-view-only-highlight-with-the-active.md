---
id: 1046
title: Use the active theme pair for diff highlighting
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/use-the-active-theme-pair-for-diff-highl
cli_override: cursor
model_override: composer-2.5
review_cli_override: muse
review_model_override: muse-spark-1.3
created_at: "2026-11-06T23:18:09Z"
updated_at: "2026-11-07T01:15:25Z"
handoff_signal_retry_count: 1
last_check_failure: "repoos check at 2026-11-07T00:01:56.991Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
incomplete_review_retries: 1
---
## Problem

`highlightPair` in `src/ui-app/src/lib/syntax-highlight.ts` currently asks Shiki for all four theme variants, even though only one light/dark family is visible at a time. This adds unnecessary highlighting work for every diff.

## Desired UX

Opening a diff highlights it with only the active theme family’s light and dark themes. Switching between light and dark remains instant, while switching theme families re-highlights the open diff. Switching back to a previously used family reuses cached output.

## Acceptance criteria

- [ ] `highlightPair` accepts the active theme family and requests only that family’s light and dark themes from Shiki.
- [ ] Light/dark tokens continue to use the existing CSS custom properties, with `style.css` selecting colors based on `[data-theme]`; toggling light/dark does not re-highlight.
- [ ] Changing `data-ui-theme` while a diff is open re-highlights it using the new family.
- [ ] Theme modules for a family are loaded lazily when that family is first needed.
- [ ] Highlighted output is cached per file pair and theme family; switching back to a cached family does not re-highlight.
- [ ] Existing lazy grammar loading, the size ceiling and plain-text fallback, and HTML escaping remain intact.
- [ ] Tests verify the active pair is used, family switching re-highlights once, and switching back uses the cache. Existing syntax highlighter, Catppuccin theme, and DiffView tests pass.
- [ ] There are no visual changes across the four themes.
- [ ] The PR description includes before/after highlighting timings for a large TypeScript file.

## Notes for AI

- Relevant files include `src/ui-app/src/lib/syntax-highlight.ts`, `DiffView.vue`, `style.css`, and their tests.
- Preserve the existing light/dark CSS switching behavior and other highlighting safeguards.
- Use a large TypeScript file for the timing comparison; the explanation’s local benchmark used `db.ts`.

## Scope

This task covers theme-family selection, lazy loading, cache behavior, and verification of diff highlighting. It does not change the appearance of the four themes.

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
- 2026-11-06T23:18:43Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-11-06T23:19:42Z · status inbox→ready
- 2026-11-06T23:19:49Z · cli_override, model_override
- 2026-11-06T23:19:51Z · model_override
- 2026-11-06T23:19:56Z · review_cli_override
- 2026-11-06T23:19:58Z · review_model_override
- 2026-11-06T23:19:59Z · status ready→active, branch
- 2026-11-06T23:35:47Z · CTO nudge: held — handoff gate is running
- 2026-11-07T00:01:53Z · message_queued at 2026-11-07T00:01:53.913Z
- 2026-11-07T00:01:56Z · message_delivered: 1 message(s)
- 2026-11-07T00:06:19Z · note: handoff requested (cli)
- 2026-11-07T00:17:51Z · message_queued at 2026-11-07T00:17:51.084Z
- 2026-11-07T00:17:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T00:22:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T00:42:50Z · CTO nudge: held — handoff gate is running
- 2026-11-07T01:01:13Z · message_queued at 2026-11-07T01:01:13.869Z
- 2026-11-07T01:02:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T01:07:53Z · message_delivered: 1 message(s)
- 2026-11-07T01:07:55Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-07T01:13:18Z · status active→review
- 2026-11-07T01:14:33Z · note: review pass 1: incomplete — no verdict in report
- 2026-11-07T01:15:25Z · message_queued at 2026-11-07T01:15:25.972Z
