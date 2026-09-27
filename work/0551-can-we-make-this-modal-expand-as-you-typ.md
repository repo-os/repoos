---
id: "0551"
title: Let long prompts auto-grow the composer textarea
type: feature
status: review
priority: p3
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/let-long-prompts-auto-grow-the-composer-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-09-27T14:05:52Z"
updated_at: "2026-09-27T15:15:05Z"
check_retry_count: 2
last_check_failure: "[object Object]"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

The prompt composer (the modal's text area) is a fixed height. When a user
types a long prompt, the text scrolls inside a small box instead of the box
growing to reveal what was written. The user cannot see more than a few lines
of their own prompt while composing it, which makes writing anything long
frictionary.

## Desired UX

- As the user types, the text area grows vertically to fit the content, up to
  a sensible maximum height.
- Once the content exceeds that maximum, the text area stops growing and the
  text scrolls inside it as it does today.
- When text is deleted, the text area shrinks back down, so the modal does not
  stay needlessly tall.
- If auto-growing turns out to be infeasible or too invasive, the acceptable
  fallback is a modest increase to the text area's fixed height (a few extra
  lines) — the user's second option, and explicitly fine.

## Acceptance criteria

- [ ] Typing multiple lines into the prompt composer increases the text area's
      height so the newly typed lines are visible without scrolling.
- [ ] The growth stops at a maximum height (roughly a full screen / a dozen or
      so lines); beyond that the area scrolls internally and does not grow
      further.
- [ ] Deleting text shrinks the text area back down proportionally.
- [ ] Initial state (empty composer) is unchanged from today's default height.
- [ ] The modal itself remains usable at the maximum text area height: its
      footer/actions are still reachable and it still fits the viewport on a
      small window without being cut off.
- [ ] Existing behaviour is preserved: focus, placeholder text, keyboard
      shortcuts (submit, newline, escape) and the submit-disabled-when-empty
      rule all still work.
- [ ] Fallback option is acceptable if auto-grow proves impractical: a fixed
      text area height a few lines larger than today, with the same
      reachability and behaviour checks.
- [ ] `repoos check` passes (build, lint/format, tests, UI smoke test).

## Notes for AI

- Locate the composer: it is the `ff-textarea` field inside the body-teleported
  shared dialog components (`src/ui-app/src/ui/dialog/*`), used by the
  New-task / New-story / New-input drawers. Global form classes live in
  `src/ui-app/src/style.css` — do not add bespoke colors/borders/spacing in a
  component's `<style scoped>` block.
- Prefer a small, self-contained growth implementation (e.g. a
  `field-sizing: content` usage if browser support in the WebKit smoke test is
  adequate, otherwise a scroll-height-reset technique or a `textarea` auto-grow
  helper) over a new component or a Vue directive.
- Reset the height to its base value before measuring `scrollHeight`, otherwise
  the box can only ever grow.
- Keep the existing custom styled components and form-class conventions — no
  default unstyled controls.
- After the change, rebuild (`bun run build:ui` is enough for a UI-only diff) so
  the worktree build is fresh.
- Assumption: the maximum height should be bounded rather than unbounded, and
  the growth applies to this one composer field — not to every `textarea` in the
  app. Do not generalise it into a shared behaviour for all text areas.
- Assumption: the fallback (a few lines taller) is a valid outcome and does not
  need a separate task; record which path was taken in the task's Activity when
  handing off.

## Scope

Covers: vertical auto-grow (or, if fallback, the taller fixed height) for the
prompt composer in the task/story/input creation modals.

Deferred: the same treatment for other text areas in the app (settings,
filters, commit message fields), any horizontal resizing, and any change to
character limits or submission behaviour.

## Original prompt

Can we make this modal expand as you type text larger than the text area? or if that's too hard just make this a few lines larger (text area).

## Screenshots

![Screenshot-2026-09-27-at-22.04.52](/api/tasks/0551/attachments/screenshot-1.png)

## Activity

- 2026-09-27T14:05:52Z · created · hello@repoos.org
- 2026-09-27T14:05:53Z · screenshots
- 2026-09-27T14:06:13Z · status draft→inbox, title, priority, area, body
- 2026-09-27T14:11:14Z · cli_override, model_override
- 2026-09-27T14:11:17Z · model_override
- 2026-09-27T14:11:19Z · status inbox→ready
- 2026-09-27T14:11:20Z · status ready→active, branch
- 2026-09-27T14:23:56Z · status active→ready
- 2026-09-27T14:40:07Z · status ready→active
- 2026-09-27T14:41:30Z · note: Implemented bounded auto-grow for the task, story, and input freeform composer textareas; empty height stays at the existing 230px minimum and growth caps at 45vh/420px.
- 2026-09-27T14:44:15Z · status active→review
- 2026-09-27T14:46:37Z · status review→active
- 2026-09-27T14:51:57Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-09-27T15:03:42Z · handoff failed · check failed after 2 automatic retries · remote validation failed (exit 137) — + pinia@4.0.2
+ radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [5.69s]
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1:    40 Killed                  vue-tsc --noEmit -p src/ui-app/tsconfig.json
error: script "build:ui" exited with code 137
error: script "build:raw" exited with code 137
error: script "build" exited with code 137
[validate] gate exit 137 — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-09-27T15:08:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-27T15:09:26Z · status active→review
- 2026-09-27T15:09:27Z · status review→active
- 2026-09-27T15:09:44Z · handoff failed · task-file handoff failed at check · remote validation failed (exit 137) — + pinia@4.0.2
+ radix-vue@1.9.17
+ shiki@4.4.3
+ tailwind-merge@3.6.0
+ tailwindcss@4.3.3
+ typescript@5.9.3
+ vite@8.2.0
+ vitest@4.1.10
+ vue@3.5.40
+ vue-router@5.2.0
+ vue-tsc@3.3.9
422 packages installed [5.78s]
$ bun scripts/build.mjs
$ tsc -p tsconfig.json && bun run build:ui && bun scripts/copy-assets.mjs
$ vue-tsc --noEmit -p src/ui-app/tsconfig.json && vite build --config src/ui-app/vite.config.ts
/usr/bin/bash: line 1:    40 Killed                  vue-tsc --noEmit -p src/ui-app/tsconfig.json
error: script "build:ui" exited with code 137
error: script "build:raw" exited with code 137
error: script "build" exited with code 137
[validate] gate exit 137 — retry once the runner is available, or set remoteValidation.fallbackToLocal to run the full gate locally
- 2026-09-27T15:15:05Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
