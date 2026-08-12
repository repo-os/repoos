---
id: "0140"
title: Make screenshot regeneration adhoc at done-time (skip by default)
type: chore
status: done
priority: p2
area: server
assigned_to: ai
created_by: ai
branch: feat/make-screenshot-regeneration-adhoc-at-do
created_at: "2026-08-12T13:00:00Z"
updated_at: "2026-08-12T22:30:00Z"
---
## Problem

Every move-to-done runs `scripts/capture-screenshots.mjs` unconditionally as part of the close-out pipeline. Screenshots are only consulted in two contexts:
1. `repoos check`'s freshness guard (fails if stale)
2. Visual documentation for human review (typically adhoc / before deploying)

For the vast majority of task close-outs, regenerating screenshots is pure waste — it launches a headless browser, serves the app against a fixture repo, takes multiple PNGs, and writes a hash file. None of this affects the task's correctness. The UI smoke test in `repoos check` already catches mounting failures, console errors, and CSS regressions.

## Desired UX

- Screenshot regeneration is **off by default** during move-to-done.
- A CLI flag `--with-screenshots` (or env var `REPOOS_DONE_SCREENSHOTS=1`) opts back in for the rare case (deployment prep, UI doc refresh).
- The toggle persists nowhere — it's an adhoc choice per close-out.
- The screenshots freshness guard in `repoos check` skips gracefully when screenshots don't exist (it already does this).

## Acceptance criteria

- [ ] `completeTask` in `src/server/done.ts` skips the screenshot step by default.
- [ ] The screenshot step runs when `REPOOS_DONE_SCREENSHOTS=1` is set in the server environment.
- [ ] The move-to-done pipeline completes without screenshots and produces a green `repoos check`.
- [ ] `repoos check`'s screenshots guard already skips when no screenshots are committed — verify this path works end-to-end.
- [ ] `repoos check` passes.

## Notes for AI

- Touch point: `src/server/done.ts` — the `SCREENSHOT_STEPS` / `shots` / `onProgress("screenshots")` section around lines 331-437.
- Also skip committing regenerated screenshots at line 335. The post-close-out `git commit -m "chore: regenerate dist and screenshots"` should only happen when screenshots were actually generated.
- The screenshots freshness guard in `src/commands/check.ts` lines 390-424 already checks `existsSync(HASH_FILE)` before doing anything — it won't fail when screenshots are absent.
- Make the decision early in `completeTask` so the whole screenshot section is skipped, not just the browser launch.
- No Settings/UI toggle needed — this is a server-side behavior, not a user preference.

## Activity

- 2026-08-12T13:00:00Z · created · ai
- 2026-08-12T13:10:37Z · status ready→active, branch
- 2026-08-12T13:22:25Z · status active→review
- 2026-08-12T22:30:00Z · status review→done
