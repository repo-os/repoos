---
id: "0899"
title: "Easter eggs bundle: screenshot dropzone layout, CLI screenshot captions"
type: bug
status: active
hold: true
priority: p3
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-screenshot-dropzone-l
cli_override: cursor
model_override: composer-2.5
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-10-21T13:43:38Z"
updated_at: "2026-10-21T16:36:22Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on bee — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: 4ffff8a8c3a575b4eb2eee506797f91ad72280cd
---
## Items
- [ ] **E1 · Screenshot dropzone wraps to two lines** (web) — after #0877 made `ShotDropzone` a `<label>`, the global `.field label` rule leaks into it. Source: user report 2026-10-21.
- [ ] **E2 · CLI captions for multiple screenshots** (cli) — pair repeated `--caption` flags with repeated `--screenshot` flags by position instead of rejecting them. Source: user report 2026-10-21.

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body.


## E1 · Screenshot dropzone wraps to two lines

### Problem
Since #0877 the screenshot dropzone (`src/ui-app/src/components/ShotDropzone.vue`) renders as a `<label class="shot-dropzone">`. Inside a `.field` wrapper (New input, New task, and the TaskDrawer screenshots section) the global `.field label` rule in `src/ui-app/src/style.css` (specificity 0,1,1) beats `.shot-dropzone` (0,1,0). It forces `display: block`, 10px uppercase monospace, letter-spacing and `margin-bottom: 6px` onto the dropzone. The result: the icon and the text stack on two lines instead of sitting side by side on one, and the text is uppercase mono. See the attached screenshots (New input and New task panes). The PWA picker itself now works; only the layout regressed.

### Desired UX
- The dropzone looks as it did before #0877: icon and text on one row (`display: flex`, centered, 9px gap), 12.5px normal-case body font, no extra bottom margin.
- Same everywhere the dropzone appears: New input, New task (Freeform and Manual tabs), TaskDrawer screenshots section, and any other `.shot-dropzone` use (check `SettingsImportExport.vue` and grep for `shot-dropzone`).

### Acceptance criteria
- Fix by raising the dropzone's specificity or resetting the leaked properties (e.g. `.field .shot-dropzone`), not by changing the host panels. The `.field label` rule stays unchanged for real labels.
- Test (style or component test): the dropzone's computed `display` is `flex` and `text-transform` is `none` when nested in `.field`.
- Verified in the browser at panel width and a narrow width: one row where the text fits, wrapping only the text, never the icon above it. Light and dark themes checked.
- All usages listed above checked, not just the two in the screenshots.

### Notes for AI
Start from the `.shot-dropzone` block in `src/ui-app/src/style.css` (~line 6970) and `.field label` (~line 5655). Declare a `## Shots` for New input and New task. Source: user report 2026-10-21 with two screenshots.

## E2 · CLI captions for multiple screenshots
### Problem
`repoos new` / `repoos update` reject `--caption` when more than one `--screenshot` is given (`screenshotFlagError` in `src/commands/tasks.ts`, tested in `src/ui-app/tests/cli-screenshots.test.ts`). A request with several images therefore lands with generic alt text (`![1]`, `![2]`) or needs one command per image, which duplicates attachments that are already stored. Found while filing this bundle with two screenshots (2026-10-21).

### Desired UX
- Repeated `--caption` flags pair with repeated `--screenshot` flags by position: the Nth caption labels the Nth screenshot.
- Fewer captions than screenshots is fine (the rest keep default alt text). More captions than screenshots, or a caption with no screenshot, is an error that names the counts.
- A single `--caption` with a single `--screenshot` behaves exactly as today. `--help` and `user-docs/cli.md` describe the pairing.

### Acceptance criteria
- Test: two `--screenshot` plus two `--caption` write both alt texts in order in `## Screenshots`.
- Test: one caption with two screenshots labels only the first; three captions with two screenshots errors.
- Test: single screenshot with single caption is unchanged, and `--caption` with no `--screenshot` still errors.
- The help text and CLI docs match the new behavior.

### Notes for AI
Start from `screenshotFlagError` in `src/commands/tasks.ts` and the flag parsing that feeds it; check that the CLI's arg parser keeps repeated `--caption` values as a list. Source: user report 2026-10-21.

## Shots
```json
[
{
"label": "New input screenshot dropzone single-row layout",
"target": "default",
"route": "/inputs?input=new",
"highlight": ".shot-dropzone"
},
{
"label": "New task screenshot dropzone single-row layout",
"target": "default",
"route": "/work?task=new",
"highlight": ".shot-dropzone"
}
]
```

## Screenshots

![1](/api/tasks/0899/attachments/att_6573b9c6-4601-44c5-a381-0a2e1a8b6e8c.png)
![2](/api/tasks/0899/attachments/att_4a56fb0d-3858-4cd1-bc4c-be4ab34a6eb8.png)

## Activity

- 2026-10-21T13:43:38Z · created · njachowski@gmail.com
- 2026-10-21T13:43:42Z · screenshots
- 2026-10-21T13:43:45Z · needs_input
- 2026-10-21T13:44:06Z · needs_input
- 2026-10-21T14:21:41Z · body: E2 · CLI captions for multiple screenshots (added)
- 2026-10-21T14:21:50Z · body: Items (added 1)
- 2026-10-21T14:21:53Z · title, area
- 2026-10-21T14:27:40Z · needs_input
- 2026-10-21T14:42:00Z · cli_override, model_override
- 2026-10-21T14:44:22Z · model_override
- 2026-10-21T14:44:32Z · review_cli_override, review_model_override
- 2026-10-21T14:44:37Z · review_model_override
- 2026-10-21T14:47:18Z · needs_input
- 2026-10-21T14:52:29Z · status inbox→ready
- 2026-10-21T14:52:38Z · status ready→active, branch
- 2026-10-21T14:55:46Z · body
- 2026-10-21T15:00:29Z · body
- 2026-10-21T15:02:05Z · body
- 2026-10-21T15:12:03Z · handoff failed · remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T15:17:42Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T15:19:34Z · body
- 2026-10-21T15:20:41Z · body
- 2026-10-21T15:20:51Z · body
- 2026-10-21T15:21:17Z · body
- 2026-10-21T15:33:30Z · handoff failed · remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on bee — fix it in the feature branch and re-run the gate
- 2026-10-21T15:38:53Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-21T15:38:53Z · note: handoff requested (cli)
- 2026-10-21T15:47:19Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on bee — fix it in the feature branch and re-run the gate
- 2026-10-21T15:52:43Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T15:54:42Z · body
- 2026-10-21T15:59:37Z · body
- 2026-10-21T16:02:48Z · body
- 2026-10-21T16:19:07Z · CTO nudge: held — machine under pressure (the memory compressor is holding 36% of RAM (8.7 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T16:36:22Z · CTO nudge: held — machine under pressure (the memory compressor is holding 40% of RAM (9.7 GB of RAM) — holding new work until memory pressure eases)
