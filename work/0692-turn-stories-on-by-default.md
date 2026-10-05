---
id: "0692"
title: Turn Stories on by default
type: chore
status: inbox
priority: p2
area: core
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T17:33:12Z"
updated_at: "2026-10-05T17:33:20Z"
---
## Problem

The Stories feature is off by default (`stories.enabled = false`, documented in user-docs/configuration.md and the annotated starter `repoos.toml`). The owner finds stories most useful for the human: seeing how tasks relate to each other and what a body of work is about. In a real run, stories were off until someone remembered to add `[stories] enabled = true`, so the Stories page, the story field on tasks, and the story PM chat were invisible by default.

## Desired UX

Stories are on by default in RepoOS: a fresh `repoos init` project and any project that has not set the key show the Stories page and the Story field on tasks. Projects that explicitly set `stories.enabled = false` keep it off.

## Acceptance criteria

- Change the default of `stories.enabled` to `true` in `src/core/config.ts` (and any place that mirrors the default: types, config schema / Settings UI default, `repoos doctor`, the annotated starter in user-docs/configuration.md, the `repoos init` template and the support bundle).
- Existing explicit values are respected; add a test for default true, explicit false stays false, and explicit true.
- The empty state of the Stories page explains what a story is and how to create one (the board with zero stories must look intentional, not broken), with a test or screenshot.
- Settings keeps its control for the key (repo rule: every user-facing setting has a Settings control); the control's help text reflects the new default.
- Update user-docs: configuration reference default, the stories section, and getting-started if it mentions turning stories on. Add a changelog line.
- `repoos check` passes.

## Notes for AI

Part of a small set of follow-ups from the first agent-driven project run (see the story). Be careful that other defaults and nav entries (the left-nav Stories item) behave when the list is empty. Never hand-edit work/*.md or stories/*.md.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read it for the background of the run that produced this task, then verify its facts against the current source.

## Activity

- 2026-10-05T17:33:12Z · created · unknown
- 2026-10-05T17:33:19Z · story
- 2026-10-05T17:33:20Z · body: section Story context
