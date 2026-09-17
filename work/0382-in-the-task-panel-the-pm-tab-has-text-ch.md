---
updated_at: "2026-09-17T07:12:34Z"
review_passes: 1
id: "0382"
title: "Screenshot upload in the PM chat tab, and never lose task screenshots"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/screenshot-upload-in-the-pm-chat-tab-and
model_override: opencode-go/minimax-m3
review_model_override: opencode-go/hy3
created_at: "2026-09-17T05:19:55Z"
handoff_signal_retry_count: 1
dev_error_count: 1
---
## Problem

The PM tab in the task panel is a text-only chat. Its compose form only sends
`text` (`src/ui-app/src/components/TaskDrawer.vue` PM tab, `pm-compose` around
line 3858; server `pmMessage` in `src/server/routes/tasks.ts:1146`), so there is
no way to give the PM a screenshot. That matters because the PM is the agent
that edits the task spec, and screenshots are often the clearest statement of
the problem.

Two related gaps fall out of the same root cause — a screenshot taken for a
task has no guaranteed path into the task file:

- **Input → task conversion drops attachments.** `InputsView.createTaskFromInput`
  (`src/ui-app/src/views/InputsView.vue:84`) calls
  `repo.createFreeformTask(input.body)` with the text only; the input's
  attachments are never copied to the created task, so screenshots captured on
  an input are lost the moment it becomes a task.
- **Screenshot preservation on edit is asserted, but not audited end to end.**
  Body rewrites are meant to carry `## Screenshots` (plus `## Original prompt`
  and `## Activity`) over from disk via `PROTECTED_SECTIONS` in
  `src/server/write.ts`, and `src/ui-app/tests/task-protected-sections.test.ts`
  covers `patchTaskFile` body replacement. It is not confirmed that *every*
  task-body write path (spec edit modal, PM-driven rewrites, hotfix/body
  replacement, core `updateTask`/CLI update) preserves screenshots, and there
  is no test that an input's screenshots survive conversion.

## Desired UX

- The PM tab's compose box gets a small attach-screenshot button (paperclip,
  matching the New input panel's "Add screenshot or file" control), supporting
  multi-select and drag/drop. Because the task already exists, a selected image
  uploads immediately to that task and shows a thumbnail chip above the compose
  box until the upload completes.
- Any screenshot uploaded in the PM tab is persisted to the task's attachment
  folder and lands in the task's `## Screenshots` section (before `## Activity`).
- The PM is told which screenshots were just provided for this task (their
  URLs/paths) and is expected to reference or link them in the spec where
  relevant. Net effect: a screenshot provided for a task is always linked
  somewhere in that task.
- Turning an input into a task carries the input's screenshots onto the new
  task — copied into the task's own attachments and referenced in its
  `## Screenshots` section, so the task is self-contained.
- Editing the task markdown never removes existing screenshots: spec edits,
  `repoos update --body`, PM rewrites, and hotfix recovery all preserve the
  `## Screenshots` section exactly as `PROTECTED_SECTIONS` intends.

## Acceptance criteria

- [ ] The PM tab compose box shows a small attach-screenshot control; selecting
      one or more images (and drag/drop, if the panel already supports it)
      uploads them against the current task id via
      `POST /api/tasks/:id/attachments`, with a pending thumbnail that clears
      on success.
- [ ] Each uploaded screenshot appears in the task's `## Screenshots` section
      exactly once, located before `## Activity`.
- [ ] The PM message path passes the new screenshot reference(s) (URL and/or
      repo-relative path) into the PM's context/prompt (`pmMessage`,
      `taskPmPrompt` in `src/server/agents.ts:1862`) so the PM can link them in
      the spec when appropriate.
- [ ] Resolving an input with attachments into a task copies those attachments
      onto the created task and adds them to its `## Screenshots` section; no
      input attachment is dropped.
- [ ] Regression tests cover: screenshot uploaded via the PM tab ends up in
      `## Screenshots`; input attachments are carried onto the created task;
      every task body-write path preserves `## Screenshots`; a screenshot
      survives repeated spec edits/rewrites.
- [ ] The screenshot-preservation audit is recorded (a test or an explicit
      note in the task activity) for any write path that was found unprotected.
- [ ] `repoos check` passes and the UI is rebuilt (`bun run build:ui`).

## Notes for AI

- **Files to touch (likely):** `src/ui-app/src/components/TaskDrawer.vue` (PM
  tab compose markup/state), `src/server/routes/tasks.ts` (`pmMessage` ~1146,
  `uploadScreenshot` ~444), `src/server/attachments.ts` (`saveScreenshot`,
  `appendScreenshotsSection`), `src/server/agents.ts` (`taskPmPrompt`),
  `src/ui-app/src/views/InputsView.vue` (`createTaskFromInput`),
  `src/ui-app/src/stores/repo.ts` (`createFreeformTask`, `resolveInput`,
  `uploadScreenshot`, `uploadInputAttachment`), and
  `src/ui-app/tests/task-protected-sections.test.ts` + `attachments.test.ts`.
- Reuse the existing attachment machinery: base64-in-JSON uploads via
  `saveScreenshot`, storage under `work/.attachments/<taskId>/`, and the
  `## Screenshots` section writer. Do not add a runtime dependency (zero-dep
  constraint).
- Screenshots are gitignored binaries — never `git add` them; the committed
  record is the task `.md`. Do not commit anything under `work/.attachments/`
  or `inputs/.attachments/`.
- `## Screenshots` is system-managed: keep it out of
  `CALLER_OVERRIDABLE_SECTIONS` in `src/server/write.ts` so a plain body
  replacement can never set or clear it. Only `addScreenshot` appends to it.
- Assumption: a screenshot added while chatting on an existing task attaches to
  that task immediately; the PM tab needs no separate queued/draft screenshot
  state (unlike the New task panel, which uploads after the task is created).
- Assumption: input→task conversion copies the image bytes onto the task rather
  than linking the input's attachment URL, so the task stays self-contained and
  is unaffected by later input deletion.
- Preserve existing accessibility labels/aria attributes and the existing
  compose-box styling conventions.
- Do not auto-request a preview; request one only if the human explicitly asks,
  by emitting `::repoos-preview-request::`.
- If this changes documented behavior, update the directly affected lines in
  `AGENTS.md`/`docs/`/`user-docs/` as part of this task (scoped to the diff).

## Scope

Covers: screenshot upload in the PM tab and PM awareness of those screenshots;
carrying input attachments onto tasks created from inputs; auditing and testing
screenshot preservation across task-body write paths.

Deferred: non-image (arbitrary file) attachments in the PM chat; inline
screenshot rendering richer than thumbnails in the chat thread; screenshot
upload for other agent chats (debugger/CTO).

## Related

- #0123 — task screenshot attachments (`## Screenshots`, `.attachments/`)
- #0317 — protected body sections (screenshots/prompt/activity preserved)
- #0345 — Original prompt preservation on malformed PM responses
- #0359 — input → task resolution flow

## Original prompt

In the task panel the PM tab has text chat but no way to add screenshots, let's add screenshot upload in that chat  (a small button is good, see attached screenshot) and the PM agent should be able to include screenshots in the task spec if appropriate (likely any screenshots provided to the PM for a task should be included / linked to in the task somewhere). also if an input has screenshots and it gets turned into a task those screenshots should always be included in the task. and check that tasks can never lose screenshots when the task md file is edited (I think we discussed this before but I'm not sure if there are tests to cover that case)

## Screenshots

![Screenshot-2026-09-17-at-13.19.44](/api/tasks/0382/attachments/screenshot-1.png)

## Activity

- 2026-09-17T05:19:55Z · created · hello@repoos.org
- 2026-09-17T05:19:56Z · screenshots
- 2026-09-17T05:21:21Z · status draft→inbox, title, area, body
- 2026-09-17T05:32:19Z · model_override
- 2026-09-17T05:32:30Z · review_model_override
- 2026-09-17T05:32:32Z · status inbox→ready
- 2026-09-17T05:32:34Z · status ready→active, branch
- 2026-09-17T05:32:37Z · agent exited with an error (opencode) · error: No endpoints found that support tool use. Try disabling "bash". To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection
- 2026-09-17T06:13:17Z · model_override
- 2026-09-17T06:13:19Z · needs_input
- 2026-09-17T07:01:17Z · body
- 2026-09-17T07:02:17Z · body
- 2026-09-17T07:08:02Z · status active→review

