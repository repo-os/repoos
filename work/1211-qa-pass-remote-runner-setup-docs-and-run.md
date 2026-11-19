---
updated_at: "2026-11-19T00:42:03Z"
review_passes: 1
id: "1211"
title: "QA pass: remote runner setup docs and runner health screens vs real bee/thinkpad/mini behavior"
type: bug
status: review
priority: p2
area: [web, docs]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-remote-runner-setup-docs-and-run
created_at: "2026-11-19T00:17:32Z"
---
## Problem
Docs and UI for adding and checking remote runners may not match how bee, thinkpad and mini are actually run (systemd, user accounts, PATH).
## Desired UX
Docs and runner health screens match reality, including the case where a server runs under a different user than the ssh login.
## Acceptance criteria
- Read-only: do not ssh or change any runner. Compare user-docs and runner UI/code paths with the scripts in justfile (setup-bee etc.); headless Playwright only if UI is touched; never open a visible browser.
- Fix stale docs and UI wording with tests; commit docs/qa/2026-11-runner-docs.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T00:17:32Z · created · t@t
- 2026-11-19T00:17:37Z · status inbox→ready
- 2026-11-19T00:17:39Z · status ready→active, branch
- 2026-11-19T00:27:45Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:33:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:41:31Z · status active→review
- 2026-11-19T00:41:31Z · message_queued at 2026-11-19T00:41:31.782Z
- 2026-11-19T00:41:31Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-19T00:42:03Z · note: review pass 1: needs some work

