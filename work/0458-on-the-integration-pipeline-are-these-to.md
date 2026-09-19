---
id: "0458"
title: Fix integration pipeline tooltips and add debug panel link
type: chore
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-integration-pipeline-tooltips-and-ad
review_model_override: opencode-go/mimo-v2.5
created_at: "2026-09-19T23:52:52Z"
updated_at: "2026-09-19T23:57:26Z"
---
## Problem

The integration pipeline UI displays tooltips describing the merge gate checks, but these may be stale — they likely reflect hard-coded steps from RepoOS's own check flow rather than the actual checks defined in the task's repo's `repoos.toml`. When users click a pipeline step, there's no direct way to jump to the debug output for that specific check.

## Desired UX

- Integration pipeline step tooltips accurately describe the actual checks from the repo's `repoos.toml` — label, command, timeout, dependencies — not a generic RepoOS flow
- Clicking a pipeline step jumps to the task panel's debug tab and scrolls to that check's execution output, if available

## Acceptance Criteria

- [ ] Tooltips on integration pipeline steps pull their text from the repo's actual `repoos.toml` check config, not hard-coded values
- [ ] Tooltips update dynamically if the config changes during a check run
- [ ] Clicking a pipeline step opens the task debug panel on that check's execution
- [ ] Works correctly when a check is still running, has finished, or has not yet run

## Notes for AI

- Integration pipeline UI is likely in `src/ui-app/src/views/` — find which view renders the pipeline steps and their tooltips
- Tooltips currently probably have static text; change them to read from the `checkPlan` or `repoos.toml` config for the repo
- When a step is clicked, emit or navigate to show the debug panel; the debug tab likely exists already and just needs a scroll target or anchor to the check output for that step
- Assumption: the task's repo config is available in the task context; verify how the UI currently accesses `repoos.toml` data or check plan metadata
- Do not hard-code any check names or steps — all text must come from the repo's config

## Scope

This task covers the UI layer only (tooltips and navigation). It does not cover changes to check plan structure, output format, or how checks are executed — those are separate.

## Related

Likely touches the task debug/panel views and the check execution display in the UI.

## Original prompt

On the integration pipeline are these tooltips still accurate (reflecting the actual steps of the repo it's in now that the checks/tests are defined in repoos.toml instead of hard-coded to RepoOS repo's flow?) also when you click on this it should open the task's panel debug tab showing the merge gate check running.

## Screenshots

![Screenshot-2026-09-20-at-07.49.52](/api/tasks/0458/attachments/screenshot-1.png)

## Activity

- 2026-09-19T23:52:52Z · created · hello@repoos.org
- 2026-09-19T23:52:55Z · screenshots
- 2026-09-19T23:53:14Z · status draft→inbox, title, area, type, body
- 2026-09-19T23:53:49Z · review_model_override
- 2026-09-19T23:53:54Z · status inbox→ready
- 2026-09-19T23:57:26Z · status ready→active, branch
