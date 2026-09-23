---
id: "0493"
title: Add timestamp to MTD failure card so users can tell if it's a stale or fresh failure
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-timestamp-to-mtd-failure-card-so-use
pm_cli_override: cursor
pm_model_override: composer-2.5
review_model_override: opencode-go/hy3
created_at: "2026-09-23T04:39:06Z"
updated_at: "2026-09-23T06:30:22Z"
---
## Problem

When **Move to done** fails (merge conflict, `repoos check`, validation, etc.), the task drawer shows `DoneErrorCard` in panel mode with a headline like **Move to done failed** **at check**, plus the error detail. That headline has **no time**.

Close-out can fail in the background after the `/done` POST returns (#0199): the user may click **Move to done** again while an old failure is still on screen, or wait through a long check and not know whether the red block updated. Without a timestamp there is no signal that a new attempt failed vs. the UI still showing the previous one.

The compact board card (`TaskCard`) only shows a clamped one-line message in card mode — it does not render the "Move to done failed at …" headline. This task targets the **task drawer / panel** surface where that headline lives.

## Root cause

- Client state: `DoneError` in `src/ui-app/src/stores/repo.ts` holds `message`, `step`, `conflicts`, `detail`, `hint`, `logPath` — **no failure time**.
- Background failures arrive on SSE `task.progress` with `step: "failed"`; events already include `at: string` (`src/ui-app/src/types.ts`) but `applyEvent` drops it when calling `setDoneError` (~repo.ts:1112).
- Synchronous failures from `completeTask` (failed `/done` response) also call `setDoneError` without recording when the failure was observed (~repo.ts:1791–1807).

## Proposed UX

In **panel mode** only, extend the existing headline in `DoneErrorCard.vue` (~lines 139–141):

- Today: `Move to done failed` + optional `at {{ step }}` (e.g. `at check`).
- After: include a **local clock time** when `failedAt` is known, e.g. `Move to done failed at check · 11:32 AM` (exact punctuation/spacing should match nearby UI; use the shared `fmtTime` helper).

Use `fmtTime` from `src/ui-app/src/lib/time.ts` (same as task debugger chat, CTO panel, etc.) so formatting stays consistent. If `failedAt` is missing (legacy in-memory state), **omit** the time segment — do not show "unknown".

Optional polish (only if trivial): `title` attribute on the headline with the full locale datetime for hover/accessibility.

**Out of scope for this task:** rehydrating `doneErrors` from the server on reconnect (#0289), relative "3 minutes ago" copy (`relTime`), or adding the timestamp to compact **card** mode (no headline there today).

## Implementation notes

1. Add optional `failedAt?: string` (ISO 8601) to `DoneError` in `repo.ts`.
2. When setting an error:
   - SSE `task.progress` with `step === "failed"`: set `failedAt: e.at` (require/propagate `at` in tests that emit these events).
   - `completeTask` HTTP failure paths: set `failedAt` to `new Date().toISOString()` at the moment `setDoneError` runs.
3. Pass `failedAt` from `TaskDrawer.vue` and `TaskCard.vue` into `DoneErrorCard` (prop + template), even though only panel mode displays it — keeps props symmetric for future card use.
4. On retry success or when the error is cleared (`setDoneError(id, null)`), timestamp goes away with the rest of the error — no separate state.

No server or API changes required; timestamp is client-side display of event time or capture time.

## Acceptance criteria

- [ ] With a task in `review` and a stored done error, opening the drawer shows **Move to done failed at &lt;step&gt;** plus a **local time** (via `fmtTime`) when the failure was recorded.
- [ ] After a **second** failed Move to done, the displayed time updates to reflect the **latest** failure (still one error object per task — `setDoneError` replaces the previous entry).
- [ ] Background SSE failure (`task.progress`, `step: "failed"`) uses the event's `at` timestamp, not the time the browser happened to process the event (unless those are the same in practice — use `e.at` as source of truth).
- [ ] When `failedAt` is absent, the headline looks as it does today (no empty or "unknown" time).
- [ ] Unit tests updated: `done-error-card.test.ts` (panel headline includes formatted time when prop set), `done-error.test.ts` (SSE and/or `completeTask` paths persist `failedAt`).

## Test plan

- `bun run test` — at least `done-error-card.test.ts`, `done-error.test.ts`, and any placement tests if props change.
- Manual: fail MTD on a `review` task (e.g. introduce a check failure), note time in headline; fix and retry MTD to fail again — time should change.

## Related

- #0385 — retry-in-flight framing on the same card (orthogonal; keep both behaviors).
- #0289 — stale done error on already-`done` tasks (do not expand scope here).
- #0428 — `logPath` on the same card (pattern for enriching `DoneError`).

## Activity

- 2026-09-23T04:39:06Z · created · unknown
- 2026-09-23T04:53:54Z · pm_cli_override, pm_model_override
- 2026-09-23T04:53:55Z · pm_model_override
- 2026-09-23T04:55:46Z · area, body
- 2026-09-23T05:44:06Z · review_model_override
- 2026-09-23T05:44:09Z · status inbox→ready
- 2026-09-23T06:30:22Z · status ready→active, branch
