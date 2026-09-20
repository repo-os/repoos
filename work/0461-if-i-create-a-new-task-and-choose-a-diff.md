---
id: "0461"
title: If I create a new task and choose a different model than…
type: feature
status: active
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/if-i-create-a-new-task-and-choose-a-diff
created_at: "2026-09-20T01:10:43Z"
updated_at: "2026-09-20T07:29:09Z"
---
When you create a task from the "New task (freeform)" pane and pick a non-default agent/CLI/model for the PM picker, that choice only drives the one-off flesh-out run. The created task's frontmatter gets no `pmAgentOverride`/`pmCliOverride`/`pmModelOverride`, so every later PM action on the task (reply-from-context runs, re-flesh-out after a failed run, restart) silently falls back to the default configured PM agent/model. The user's pick is lost right after creation.

## Desired behavior

If the user picks an agent (and/or CLI/model) other than the configured PM default in the freeform pane, the created task should KEEP that selection as its PM assignment:

- `createFreeformTask` (`src/server/routes/tasks.ts`) should write `pmAgentOverride` / `pmCliOverride` / `pmModelOverride` into the task's frontmatter when the request carries a pinned override (reuse `isModelOverridePinned`; "default" stays the sentinel for "no pin", same as elsewhere).
- The same override the flesh-out run uses must be what gets persisted — no drift between what ran and what is saved.
- TaskCard / TaskDrawer PM tab should immediately reflect the saved override (they already read `pmModelOverride` etc., so this should fall out once frontmatter is written).
- Only save overrides that actually differ from the configured PM default — picking the default should leave all three fields null (keeps the board tidy, matches the drawer's own save logic which nulls unchanged values).

## Scope notes

- The freeform pane in `TaskDrawer.vue` already sends `agentOverride`/`cliOverride`/`modelOverride` in the POST body — the gap is server-side persistence only.
- `createFreeformSkill` and `createFreeformDocument` have the same picker; decide explicitly whether they get the same persistence (lean yes for consistency, but they are secondary — call it out either way).
- Freeform tasks created from a resolved input (`InputsView`, `inputId` carry-over #0382) go through the same route, so they inherit the fix automatically.

## Edge cases

- Override names an agent that is disabled or missing by the time it's saved: still persist the string (it's a pin, not a resolution), resolution-time fallback already handles it.
- A failed/timed-out flesh-out run must NOT clear the saved override — the pin is the user's intent, independent of run success (#0461 activity: the first PM run for this very task timed out).
- Test coverage in the style of `pm-override.test.ts` / `freeform-runs.test.ts`: POST with a pinned model → task frontmatter carries `pmModelOverride`; POST without (or with "default") → all three stay null.

## Original prompt

If I create a new task and choose a different model than the default for PM, that task should keep that selected agent/model as it's PM once the task is created

## Activity

- 2026-09-20T01:10:43Z · created · hello@repoos.org
- 2026-09-20T01:13:44Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-20T01:15:23Z · body
- 2026-09-20T01:53:20Z · status draft→inbox
- 2026-09-20T04:37:26Z · status inbox→ready
- 2026-09-20T07:29:09Z · status ready→active, branch
