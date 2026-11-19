---
id: "1213"
title: "QA: automated multi-screen-size layout check for main pages"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-automated-multi-screen-size-layout-ch
created_at: "2026-11-19T02:18:15Z"
updated_at: "2026-11-19T02:29:47Z"
handoff_signal_retry_count: 1
---
## Problem
No automated check catches layout breaks at phone, tablet and desktop widths; manual QA passes found many.
## Desired UX
A headless Playwright test renders the main pages at 375, 768 and 1280 px and fails on horizontal page scroll, clipped primary buttons or overlapping fixed bars.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Cover Work, Agents, Settings, Checks, Releases and the task drawer using existing state fixtures.
- Wire into the UI smoke step so it skips cleanly if Playwright is missing; document in docs/ and user-docs if relevant.
- Fix any real layout bugs it finds, with tests.
## Notes for AI
Do not touch repoos.toml. Keep the test fast (<60s).

## Activity

- 2026-11-19T02:18:15Z · created · t@t
- 2026-11-19T02:18:37Z · status inbox→ready
- 2026-11-19T02:18:44Z · status ready→active, branch
- 2026-11-19T02:23:58Z · message_queued at 2026-11-19T02:23:58.655Z
- 2026-11-19T02:25:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T02:29:26Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T02:29:27Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The viewport matrix and documentation are in place. The first build is still running without output; once it finishes, I’ll run the requested scoped `repoos check` and address any formatting, runtime, or fixture issues it reports. · stderr: Reading additional input from stdin... 2026-11-19T02:27:11.105263Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-automated-multi-screen-size-layout-ch/user-docs/check.md: RepoOS's own repo dogfoods this same mecha…
- 2026-11-19T02:29:32Z · orphaned run process stopped · pid 13816 · /opt/homebrew/Cellar/bun/1.4.2/bin/bun run build:raw · cpu 0s · age 2m
- 2026-11-19T02:29:47Z · orphaned run process stopped · pid 19088 · node /Users/nick/code/nick/repoos-worktrees/feat/qa-automated-multi-screen-size-layout-ch/node_modul · cpu 1m · age 2m
