---
id: "0722"
title: "Docs: the easter-eggs bundle workflow as the alternative to hotfix flows (AGENTS.md + docs/)"
type: chore
status: active
priority: p2
area: docs
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/docs-the-easter-eggs-bundle-workflow-as-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-06T14:31:00Z"
updated_at: "2026-10-06T16:36:44Z"
dev_error_count: 1
---
## Problem

During the 2026-10-06 run the pull was to hotfix small issues straight on main. AGENTS.md forbids unrequested direct commits to main, and each hotfix risked a dirty main blocking Move to done. What worked instead (see #0721, 'Easter eggs bundle') was to collect small independent fixes into ONE task: one worktree, one gate run, one review, one close-out. That practice is not written down anywhere, so the next agent will either hotfix or file ten tiny tasks.

## Desired UX

Add the workflow to the repo, in two places:

1. AGENTS.md, in Rules (next to the direct-commit-to-main rule): a short 'Small fixes: bundle them as easter eggs, don't hotfix' rule. Content: (a) never hotfix main on your own initiative; (b) collect small, independent, low-risk fixes (cosmetic, copy, test-race hardening, tiny UI/data-source corrections, docs follow-ups) into ONE 'Easter eggs bundle: <themes>' task rather than one task each or a direct commit; (c) the bundle lists each item with its source task id, a one-line fix and one test per item, commits per item, and marks the source tasks superseded on completion; (d) never fold easter eggs INTO a release-critical or machinery task (a failing small item would hold up the big one); (e) keep a bundle to about 3-6 items and one area family; (f) an easter-egg bundle is p2/p3 and runs while big tasks soak or wait; (g) when a human explicitly asks for a hotfix on main, the existing exception still applies.
2. A short docs page (docs/easter-eggs-bundles.md, linked from docs/README.md), with the reasoning (why: a gate run costs 5-8 minutes and each close-out reloads the server, so N tiny tasks cost N times that), the template body (Problem lists items; Acceptance has one test per item; Notes say 'keep each item separate in commits; do not touch X') and #0721 as the worked example. Cross-link from user-docs/running-with-agents.md if it discusses how to scope tasks.

## Acceptance criteria

- AGENTS.md has the rule and it does not contradict the direct-commit and one-task-one-worktree rules (it refines them).
- docs/easter-eggs-bundles.md exists, is linked from docs/README.md, and its template matches #0721.
- repoos check passes.

## Notes for AI

Docs-only; do not touch src/. Edit AGENTS.md carefully: it is the single source of truth (CLAUDE.md is only a shim). Do not edit the AGENTS.md template string in src/commands/init.ts (that ships to other repos and needs its own decision).

## Activity

- 2026-10-06T14:31:00Z · created · unknown
- 2026-10-06T14:31:25Z · title, body
- 2026-10-06T14:57:06Z · cli_override, model_override
- 2026-10-06T14:57:12Z · status inbox→ready
- 2026-10-06T14:57:16Z · status ready→active, branch
- 2026-10-06T15:07:10Z · body
- 2026-10-06T15:18:24Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-06T15:55:42Z · needs_input
- 2026-10-06T16:10:43Z · body
- 2026-10-06T16:25:28Z · handoff failed · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0722-e4edaebe.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (c7d0b9de8cafe603ae704776248d9502afa5b636) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:30:44Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T16:30:44Z · status review→active
- 2026-10-06T16:30:50Z · handoff failed · task-file handoff failed at check · remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s
[validate] cloning bundle /home/nick/.repoos-0722-fc1b20e7.bundle
warning: You appear to have cloned an empty repository.
fatal: unable to read tree (c7d0b9de8cafe603ae704776248d9502afa5b636) — fix it in the feature branch and re-run the gate
- 2026-10-06T16:36:44Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 128) — [lock] slot 1 acquired after 0s · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-06T16:36:44Z · status review→active
