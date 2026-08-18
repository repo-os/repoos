---
id: "0215"
title: Close-out failure UI shows merge-conflict advice for non-conflict failures
type: bug
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/close-out-failure-ui-shows-merge-conflic
model_override: default
pm_model_override: default
created_at: "2026-08-15T07:05:46Z"
updated_at: "2026-08-17T15:05:32Z"
review_rounds: 1
---
## Problem

When a close-out fails, the task drawer shows:

> RepoOS couldn't sync this branch with main automatically — resolve the conflicting files in the worktree, then retry.

It shows this regardless of why the job actually failed. On #0211 the recorded reason was `check failed: …` — a test failure during the validation gate, with no conflicting files anywhere. The advice sent the user hunting for conflicts that did not exist.

The integration job already records a precise `reason`, and the phases are distinct (`syncing`, `validating`, `publishing`, `cleanup`). The UI collapses all of them onto the conflict-resolution message.

## Desired UX

The failure message should match the phase that failed:

- `validating` → the check failed; show the failing test/build output and offer to retry. No mention of conflicts.
- `publishing` with a merge conflict → the current conflict message, listing the conflicting files.
- `publishing` blocked by a dirty tree → say the tree is dirty and name the files (this is distinct from a conflict).
- `syncing` → the branch could not be brought up to date with main.

## Acceptance criteria

- [ ] The close-out error surfaces the job's actual `phase` and `reason` rather than a fixed conflict message
- [ ] A `check failed` reason renders the check output (or a readable excerpt) and never suggests resolving conflicts
- [ ] A genuine merge conflict still lists the conflicting files and the resolve-then-retry guidance
- [ ] ANSI escape codes are stripped from the reason before display — the stored reason currently contains raw escapes
- [ ] Test coverage for each failure phase mapping to its own message

## Notes for AI

- The failure reason is persisted on the integration job in `.repoos/integration-jobs/<id>.json` as `phase` + `reason`; both are already available to the UI.
- The stored reason is truncated mid-word at the front (`check failed: …eletion detected by…`) and carries raw ANSI escapes — worth fixing how the reason is captured, not just how it is rendered.
- Do not change close-out behaviour itself; this is about reporting the failure accurately.

## Related

- #0211 (the close-out whose failure surfaced this)

## Activity

- 2026-08-15T07:05:46Z · created · unknown
- 2026-08-15T11:05:53Z · status inbox→ready
- 2026-08-15T11:05:56Z · status ready→active, branch
- 2026-08-15T11:12:28Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-16T02:16:26Z · model_override
- 2026-08-16T13:43:39Z · status ready→active
- 2026-08-16T14:09:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-08-16T14:13:44Z · status active→review
- 2026-08-16T14:18:41Z · pm_model_override
- 2026-08-17T07:05:16Z · status review→active
- 2026-08-17T07:18:54Z · status active→review
- 2026-08-17T14:52:38Z · status review→active
- 2026-08-17T14:55:23Z · status active→review
- 2026-08-17T15:05:32Z · status review→done, release:success
