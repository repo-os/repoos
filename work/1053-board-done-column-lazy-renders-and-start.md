---
id: 1053
title: "Board: Done column lazy-renders and starts collapsed (measure load before/after with ~1000 done tasks)"
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/board-done-column-lazy-renders-and-start
model_override: gpt-6.1-terra
created_at: "2026-11-07T08:04:58Z"
updated_at: "2026-11-07T14:45:54Z"
last_handoff_failure_fingerprint: check|reused check inputs changed during handoff — run the check again
last_handoff_failure_sha: 4c9226dc08783300b496bbfd319929e2a58aa304
review_passes: 1
last_check_failure: "repoos check at 2026-11-07T13:50:00.006Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
handoff_signal_retry_count: 2
---
## Problem

The work board renders every done task. On 2026-11-07 the board had 997 tasks (953 done, none archived), `/api/board` returned about 2.6 MB, and `BoardColumn.vue` renders `v-for="t in repo.byStatus(col.id)"` with no windowing, no lazy rendering and no `content-visibility`, so about 950 `TaskCard` components are created on load. The loop is not behind the collapsed check, so a collapsed Done column still builds all its cards. Each card has its own computeds and re-evaluates whenever the store's task list changes (the board updates over SSE). Nobody has measured the cost; suspected effects are slow app load, janky scrolling and heavy re-renders. Done grows by dozens of tasks a day, so it only gets worse. Archived tasks are skipped by `byStatusCache`, which is the only thing that bounds a column today.

## Desired UX

- **Lazy render, no "Show more" button:** the Done column renders only what is needed. The newest done tasks render first; the rest render automatically as the user scrolls toward them (virtual scroll or incremental rendering driven by scroll position, whichever fits the card sizes), so the scroll bar and "N done" count still reflect all tasks and nothing needs a click.
- **Collapsed by default:** the Done column starts collapsed on a fresh browser (no saved preference), and while collapsed it renders no cards at all, so app load skips them. A saved per-browser preference (`repoos.board.collapsed` in `boardCollapse.ts`) still wins, and a freshly-done unacknowledged task still auto-expands it as today (#0278).
- **Configurable:** a repoos.toml setting (for example `board.doneCollapsedByDefault`, default true) and a matching control on the Settings page set the default for new browsers. Per the repo rule, add it to `getConfigSchema()` and the right Settings tab with a test; no raw-TOML-only setting.
- Search, filters, keyboard navigation and drag/drop still work on Done: keyboard navigation must never land on an unrendered card, and a search or filter that matches old done tasks must show them (render the matches, not the window).

## Acceptance criteria

- **Measure before and after, in the task report.** Before changing code, record on a ~1000-done-task board (use the live board or a fixture with at least 950 done tasks): time to first board paint, time until the board is interactive, number of `TaskCard` components and DOM nodes in the Work view, JS heap after load, and the time to scroll or toggle the Done column; take the numbers in the same browser and conditions (headless WebKit via the existing Playwright setup is fine) and give the method so it can be repeated. Repeat after the change and report both sets side by side with the percentage change. If the improvement is small, say so.
- With Done collapsed (default), the Work view creates no Done `TaskCard` components (test counts them with 1000 fixture tasks).
- With Done expanded, only a bounded number of cards exist at once (state the bound), and scrolling reveals the rest without any click; the test scrolls and sees older tasks appear.
- A saved collapse preference overrides the default in both directions; the unacknowledged-done auto-expand still works.
- The new setting has a Settings UI control, a `getConfigSchema()` entry, docs and a test (`tests/config-docs.test.ts` must pass).
- Search and keyboard navigation tests with 1000 done tasks pass; a task id typed in search finds an old done task.
- `/api/board` payload: say whether trimming old done tasks server-side (a count plus on-demand pages) is worth doing; implement it only if the measurements show the 2.6 MB load matters, otherwise record the decision in the report.

## Notes for AI

- Start in `src/ui-app/src/components/BoardColumn.vue` (the `v-for` over `repo.byStatus(col.id)`), `src/ui-app/src/lib/boardCollapse.ts` (default collapse state: `hadSavedState` and `applyCollapseDefaults`) and `byStatusCache` in `src/ui-app/src/stores/repo.ts`.
- Do not add a runtime dependency (no virtual-scroll library); zero runtime dependencies is a hard constraint. An IntersectionObserver or scroll-driven window over fixed-size slices is fine.
- Pages use the full `.main` width and any overlay rules in AGENTS.md still apply; rebuild with `bun run build:ui` after UI changes. Declare shots for the collapsed and expanded Done column.
- Keep the measurements honest: run each scenario several times and report the median.

## Shots
```json
[
{
"label": "Done column collapsed by default",
"target": "default",
"route": "/work",
"highlight": "[data-board-column=\"done\"]"
},
{
"label": "Done column expanded",
"target": "default",
"route": "/work",
"highlight": "[data-board-column=\"done\"]",
"steps": [
{
"click": "[data-board-column=\"done\"] .col-head"
}
]
}
]
```

## Activity

- 2026-11-07T08:04:58Z · created · njachowski@gmail.com
- 2026-11-07T12:41:30Z · status inbox→ready
- 2026-11-07T12:42:52Z · model_override
- 2026-11-07T12:43:07Z · status ready→active, branch
- 2026-11-07T12:45:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Task #1053 is **not complete**. I read the full specification and confirmed that the Done column currently instantiates cards even when collapsed. The baseline build passed, but I did not obtain the required before measurements or implemen… · stderr: Reading additional input from stdin...
- 2026-11-07T12:51:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Task #1053 remains incomplete, so I have not requested handoff. I collected a preliminary three-run baseline with 1,000 synthetic Done tasks: each run rendered 1,000 Done cards and 21,053 board descendant elements. The median navigation-to… · stderr: Reading additional input from stdin...
- 2026-11-07T13:04:11Z · body
- 2026-11-07T13:13:43Z · note: adopted orphaned engineer pid 10769
- 2026-11-07T13:17:07Z · body
- 2026-11-07T13:23:41Z · CTO nudge: held — handoff gate is running
- 2026-11-07T13:49:56Z · message_queued at 2026-11-07T13:49:56.588Z
- 2026-11-07T13:49:59Z · message_delivered: 1 message(s)
- 2026-11-07T13:51:40Z · note: handoff requested (cli)
- 2026-11-07T14:14:57Z · message_queued at 2026-11-07T14:14:57.222Z
- 2026-11-07T14:14:57Z · handoff failed · task-file handoff failed at verify · ui verification failed: timed out waiting for the task's browser capture
- 2026-11-07T14:14:57Z · message_delivered: 1 message(s)
- 2026-11-07T14:15:11Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (4c9226dc0) during finalization (#0734)
- 2026-11-07T14:18:41Z · CTO nudge: held — remote validation is running
- 2026-11-07T14:21:49Z · message_queued at 2026-11-07T14:21:49.003Z
- 2026-11-07T14:23:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T14:32:47Z · body
- 2026-11-07T14:39:04Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-07T14:39:04Z · message_queued at 2026-11-07T14:39:04.936Z
- 2026-11-07T14:39:05Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: 2026-11-07T14:15:00.479914Z ERROR codex_core::util: Custom tool call output is missing for call id: call_da9f40304d784958abd88c4a5cfb3dbb 2026-11-07T14:15:08.651965Z ERROR codex_core::util: Custom tool call output is missing for call id: call_da9f40304d784958abd88c4a5cfb3dbb 2026-11-07T14:15:11.093526Z ERROR codex_cor…
- 2026-11-07T14:39:05Z · status active→review
- 2026-11-07T14:39:05Z · message_delivered: 2 message(s)
- 2026-11-07T14:39:06Z · note: handoff requested (cli)
- 2026-11-07T14:39:18Z · status active→review
- 2026-11-07T14:39:18Z · note: shots: skipped — 1 shot already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-07T14:41:33Z · note: review pass 1: good to go
- 2026-11-07T14:45:42Z · handoff failed · task-file handoff failed at check · reused check inputs changed during handoff — run the check again
- 2026-11-07T14:45:54Z · message_queued at 2026-11-07T14:45:54.158Z
