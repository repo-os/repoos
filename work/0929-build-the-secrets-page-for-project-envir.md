---
id: "0929"
title: Build the Secrets page for project environments
type: feature
status: active
priority: p1
area: [web, ui]
story: Secrets and project environments
depends_on: ["0928", "0930"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/build-the-secrets-page-for-project-envir
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:06:27Z"
updated_at: "2026-10-22T19:11:07Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/deployments.test.ts > navFor deployments gating > hides Deployments unless the repo configures any, tests/deployments.test.ts > navFor deployments gating > slots Deployments after Work (and after Releases when both are on), tests/dev-page.test.ts > Dev nav gating (#0748) > hides Dev when no project declares targets on bee — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: 3b3805a62ded3d06e7724a86aa8652e967fcb27e
---
## Problem
Users have no RepoOS screen to see which project environment is selected or which expected keys are set, missing, or inherited. The metadata and write operations from #0928 need a safe, usable interface that never reveals saved values.

## Desired UX
A Secrets item appears in the sidebar between Dev and Agents. The page lets users select or create an environment, search key metadata, see source/status/visibility/consumers/restart state, and explicitly save masked replacements or confirm removals. Empty projects have a clear starting state. Changing the page selector changes only the view, not a running process or deployment.

## Acceptance criteria
- Add the sidebar route/page and place its navigation item between Dev and Agents, matching existing visual and accessibility patterns.
- Provide an environment selector and empty environment creation; list searchable rows for key name, Set/Missing/Inherited status, source, server-only/public visibility, consumers, and restart-needed state.
- Use expected key names from .env.example without importing example values. Add/replace with masked inputs and explicit Save; clear entered values from UI state after save. Provide removal confirmation that identifies affected consumers and present stale/concurrent-edit errors from #0928 accessibly.
- Keep existing RepoOS provider-key settings flows unchanged; never provide reveal/copy-existing-value behavior, never present VITE_/NEXT_PUBLIC_ style keys as private, and never include actual values in UI errors or screenshots.
- Use existing shared form/dialog components and styled dropdowns. Provide an accessible responsive empty state and preserve keyboard operation.
- Add UI tests for empty state, selection, missing/inherited rows, masked save/clear, removal confirmation, and concurrent-edit feedback using fake values only.
- Declare review shots using populated fake fixtures for light/dark/mobile, missing/inherited states, and dialogs; open and inspect every generated PNG. Do not use real values in fixtures.

## Notes for AI
Implement only the user interface and its route/state/tests; consume the metadata and mutation contracts from #0928 rather than creating alternate secret APIs. This depends on #0928. The environment selector must be view-only and must not implicitly rebind Dev, checks, or deployments. Update user-facing docs directly affected by the new page. Rebuild the UI after changes.

## Shots
```json
[
{
"label": "Secrets inventory in light theme with missing and inherited keys",
"target": "default",
"route": "/secrets?fixture=secrets&theme=light",
"highlight": ".secrets-rows"
},
{
"label": "Secrets removal confirmation in dark theme",
"target": "default",
"route": "/secrets?fixture=secrets&theme=dark",
"highlight": ".delete-confirm-modal",
"steps": [
{
"click": ".secrets-remove"
}
]
},
{
"label": "Secrets inventory on mobile",
"target": "default",
"route": "/secrets?fixture=secrets&theme=light",
"highlight": ".secrets-head"
}
]
```

## Activity

- 2026-10-22T08:06:27Z · created · njachowski@gmail.com
- 2026-10-22T08:09:21Z · depends_on
- 2026-10-22T18:11:44Z · status inbox→ready
- 2026-10-22T18:11:51Z · cli_override, model_override
- 2026-10-22T18:11:52Z · status ready→active, branch
- 2026-10-22T18:11:56Z · message_queued at 2026-10-22T18:11:56.849Z
- 2026-10-22T18:12:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T18:12:40Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T18:12:40Z · message_delivered: 1 message(s)
- 2026-10-22T18:16:08Z · body
- 2026-10-22T18:16:55Z · body
- 2026-10-22T18:18:41Z · body
- 2026-10-22T18:21:00Z · body
- 2026-10-22T18:23:21Z · body
- 2026-10-22T18:32:55Z · handoff failed · remote validation failed: test failure: tests/deployments.test.ts > navFor deployments gating > hides Deployments unless the repo configures any, tests/deployments.test.ts > navFor deployments gating > slots Deployments after Work (and after Releases when both are on), tests/dev-page.test.ts > Dev nav gating (#0748) > hides Dev when no project declares targets on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-22T18:37:57Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/deployments.test.ts > navFor deployments gating > hides Deployments unless the repo configures any, tests/deployments.test.ts > navFor deployments gating > slots Deployments after Work (and after Releases when both are on), tests/dev-page.test.ts > Dev nav gating (#0748) > hides Dev when no project declares targets on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-22T18:37:57Z · note: handoff requested (cli)
- 2026-10-22T18:46:12Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/deployments.test.ts > navFor deployments gating > hides Deployments unless the repo configures any, tests/deployments.test.ts > navFor deployments gating > slots Deployments after Work (and after Releases when both are on), tests/dev-page.test.ts > Dev nav gating (#0748) > hides Dev when no project declares targets on bee — fix it in the feature branch and re-run the gate
- 2026-10-22T18:50:53Z · message_queued at 2026-10-22T18:50:53.330Z
- 2026-10-22T18:52:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T18:53:04Z · body
- 2026-10-22T18:54:28Z · body
- 2026-10-22T18:55:13Z · body
- 2026-10-22T18:56:07Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T18:56:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T18:56:07Z · message_delivered: 1 message(s)
- 2026-10-22T18:58:46Z · body
- 2026-10-22T19:02:23Z · body
- 2026-10-22T19:11:07Z · handoff failed · remote validation failed: test failure: tests/shot-target-support-0866.test.ts > app target resolution (#0866) > keeps APP_ROUTE_PREFIXES in sync with the UI router on mini — fix it in the feature branch and re-run the gate
