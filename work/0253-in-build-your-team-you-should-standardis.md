---
id: "0253"
title: "Standardise \"build your team\" styling and make agent models editable"
type: feature
status: done
needs_input: true
needs_merge: true
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/standardise-build-your-team-styling-and-
model_override: default
review_model_override: default
created_at: "2026-08-18T15:35:42Z"
updated_at: "2026-08-25T14:45:51Z"
merge_conflict_retry_count: 1
review_passes: 2
review_rounds: 1
dev_error_count: 1
---
## Problem

The "build your team" view currently mixes two different visual treatments for
the agents it lists: some agents are rendered as rows and others as cards. This
inconsistent styling makes the view feel unfinished and harder to scan. In
addition, each agent listed there is shown without an editable coding agent +
model pairing, so users cannot configure which model an agent uses directly from
this view.

## Desired UX

"Build your team" should present every agent with a single, consistent visual
treatment (all rows or all cards, not a mix). Each agent listed should expose an
editable coding agent + model selector so the user can change the model assigned
to that agent inline.

## Acceptance criteria

- [ ] All agents in "build your team" use the same visual style (rows or cards), with no mixed rendering.
- [ ] Each agent listed has an editable coding agent + model control.
- [ ] Editing the model for an agent persists the change (via the existing task/agent API or CLI paths, no hand-written file edits).
- [ ] No runtime dependencies are added.
- [ ] `repoos check` passes (build and UI smoke test) after the change.

## Notes for AI

- This task concerns the "build your team" view in the web UI (`src/ui-app` area).
- Standardising the styling is a purely visual change; pick one treatment (the card style if that is the dominant one, otherwise rows) and apply it uniformly. Confirm which treatment the codebase currently uses before deciding, and state the choice in the change.
- The editable coding agent + model pairing must reuse existing configuration/API mechanisms (e.g. `PATCH /api/tasks/:id` or the corresponding RepoOS CLI command). Do not write directly to `work/*.md` or hand-edit task data.
- After any UI change, rebuild (`bun run build:ui` or `bun run build`) and verify with a browser probe before reporting done.
- Reuse existing select/input components and styling conventions already present in the UI; do not introduce a new component library.

## Scope

- Covers: standardising the visual treatment and adding the editable coding agent + model selector to each listed agent.
- Defers: changing how agent/model configuration is stored or any backend schema changes beyond what already exists.

## Original prompt

In "build your team" you should standardise the styling (now it's mixed between rows and cards) and each agent listed there should have an editable coding agent+model.

## Activity

- 2026-08-18T15:36:17Z · status draft→inbox, title, area, body
- 2026-08-18T15:36:51Z · status inbox→ready
- 2026-08-20T10:38:12Z · status ready→active, branch
- 2026-08-20T11:09:42Z · model_override
- 2026-08-20T11:49:27Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-20T12:23:45Z · status ready→active
- 2026-08-20T12:59:39Z · status active→review
- 2026-08-22T18:03:50Z · cli_override
- 2026-08-22T18:03:56Z · model_override
- 2026-08-22T18:04:01Z · status review→active
- 2026-08-23T04:56:27Z · model_override
- 2026-08-23T08:13:15Z · cli_override
- 2026-08-23T10:58:27Z · cli_override
- 2026-08-23T10:58:28Z · model_override
- 2026-08-23T10:58:48Z · model_override
- 2026-08-23T10:58:49Z · status active→review
- 2026-08-23T10:58:50Z · needs_merge
- 2026-08-23T11:05:31Z · cli_override
- 2026-08-23T11:51:10Z · pm_model_override
- 2026-08-23T11:51:38Z · pm_model_override
- 2026-08-24T23:41:14Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-08-25T01:00:11Z · status review→active
- 2026-08-25T05:47:35Z · model_override
- 2026-08-25T05:47:41Z · status active→review
- 2026-08-25T05:51:43Z · status review→active
- 2026-08-25T09:36:19Z · agent exited with an error (claude) · the agent process exited with an error — open the task to see the full output
- 2026-08-25T09:36:19Z · status active→review
- 2026-08-25T12:45:25Z · review_model_override
- 2026-08-25T12:45:26Z · model_override
- 2026-08-25T14:45:51Z · status review→done, release:success
