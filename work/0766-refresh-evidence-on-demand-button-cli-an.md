---
updated_at: "2026-10-13T17:17:06Z"
review_passes: 2
id: "0766"
title: "Refresh evidence on demand: button, CLI and API to re-run shots and UI verification on the current HEAD (no engineer round-trip)"
type: feature
status: review
priority: p2
area: [core, server, cli, ui]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/refresh-evidence-on-demand-button-cli-an
cli_override: codex
model_override: gpt-6-luna
review_cli_override: github copilot
review_model_override: default
created_at: "2026-10-13T10:49:44Z"
review_rounds: 1
---
## Problem
When a reviewed task's handoff evidence goes stale (shots and the ui-verification record were captured at an older commit than the reviewed HEAD, e.g. after merging main or a fix commit), the only way to refresh it is to send the task back to the engineer agent so it re-hands off. That costs a full agent turn (often a paid model), races with other edits, and reviewers then fail the task on a 'stale capture' note. Observed in the Divot repo on #0082: review passes 3 and 4 had no bugs; the only blocker was 'UI verification still points at 90835d6 / website-1..3 while reviewed HEAD is 349a024', and the reviewer's own advice was 're-handoff once'.

## Desired UX
- A 'Refresh evidence' button in the task drawer (Changes tab) and the review card: re-runs the task's shot captures (web and command targets) and the UI verification on the CURRENT branch HEAD in the existing worktree, replaces the stale captures, regenerates the ui-verification record with the new tree identity, and marks the old capture set superseded.
- CLI: repoos verify <id> [--wait] (or repoos shot --refresh <id>) with the same behaviour; API: POST /api/tasks/:id/verify returning the new tree identity, the shot list and any issues.
- Optionally offer 'Refresh evidence and re-review' which then re-runs the reviewer pass, so a stale-only blocker clears without touching an engineer.
- Safe while the task is in review: it must not modify tracked files or move the branch; it only writes the gitignored attachments/cache, takes the existing lock so it cannot run concurrently with a live engineer or close-out, and refuses (with a clear message) when the worktree is dirty or an agent is running.

## Acceptance criteria
- Server action + CLI + UI button with tests: refresh replaces stale shots and record, new record's sourceIdentity equals the current HEAD tree, the reviewer prompt then reports the capture as current, no tracked file changes, refused when a live engineer or close-out is active or the worktree is dirty.
- Works for web preview targets and [[shot.targets]] command targets (#0761); a missing tool records a visible skipped note.
- When a review fails ONLY because evidence is stale, the failure note offers 'Refresh evidence' (and the CLI hint), and an optional config key lets RepoOS do the refresh automatically once and re-review (with a Settings control and test per repo rule).
- Documented in user-docs/ (cli.md, review-and-close-out.md) and docs/.

## Notes for AI
Reuse the handoff capture and ui-handoff-gate code paths rather than copying them; the engineer-pre-empts-automatic-capture rule must not block an explicit refresh. Related: #0761, #0765, #0714/#0762. Zero runtime dependencies; Bun-first.

## Shots
```json
[
{
"label": "Changes tab with refresh evidence action",
"target": "default",
"route": "/work?task=0766&tab=changes",
"highlight": "[data-test-id=\"refresh-evidence\"]"
}
]
```

## Activity

- 2026-10-13T10:49:44Z · created · njachowski@gmail.com
- 2026-10-13T10:51:29Z · status inbox→ready
- 2026-10-13T15:56:44Z · cli_override, model_override
- 2026-10-13T15:56:54Z · model_override
- 2026-10-13T15:56:55Z · status ready→active, branch
- 2026-10-13T16:03:30Z · body
- 2026-10-13T16:06:42Z · body: section Shots
- 2026-10-13T16:09:22Z · body
- 2026-10-13T16:11:14Z · body
- 2026-10-13T16:18:52Z · status active→review
- 2026-10-13T16:20:18Z · note: review pass 1: needs some work
- 2026-10-13T16:20:20Z · status review→active
- 2026-10-13T16:34:40Z · body
- 2026-10-13T16:35:16Z · body
- 2026-10-13T16:35:58Z · body
- 2026-10-13T16:36:44Z · status active→review
- 2026-10-13T16:51:46Z · note: review pass 2: failed — no usable report
- 2026-10-13T16:51:47Z · needs_input
- 2026-10-13T17:15:00Z · review_cli_override, review_model_override
- 2026-10-13T17:15:04Z · review_cli_override
- 2026-10-13T17:15:07Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-10-13T17:17:06Z · note: review pass 3: needs some work

