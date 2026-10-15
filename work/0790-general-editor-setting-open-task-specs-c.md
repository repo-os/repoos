---
id: "0790"
title: "General editor setting: open task specs, context docs and files in the user's editor"
type: feature
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: "`needs some work` — `editor.command`, ungated open-in-editor routes, Task/Context/FailedTests wiring, `docs/open-in-editor.md`, and unit tests match the spec. Settings General is verified in light and dark on HEAD (`451292e5c`). Handoff still lacks proof of the Spec-row and Context “Open in editor” links in either theme (drawer shots are board-only; highlight missed; no fifth capture)."
priority: p2
area: [web, server, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/general-editor-setting-open-task-specs-c
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-15T06:33:35Z"
updated_at: "2026-10-15T10:44:04Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-10-15T10:42:58.931Z: repoos check failed: ui verification failed (4 issue(s)): [request] HTTP 404 for http://127.0.0.1:55861/api/tasks/9999 (http://127.0.0.1:55861/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:55861/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:55861/api/tasks/9999 (http://127.0.0.1:55861/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:5… (truncated)"
review_passes: 6
review_rounds: 2
dev_error_count: 1
---
## Problem
'Open in editor' only works through the copy inspector's setting, dev.inspector.editorCommand, and only in dev/local builds. The only editor setting lives in a group that is hidden unless the copy inspector is available. So on a normal install there is nowhere to set an editor, and the controls that use one stay hidden or dead:
- The Spec row in the task drawer (TaskDrawer.vue ~1771-1790, 'Open this task's markdown file in your configured editor').
- The Repo Context doc viewer (no 'Open in editor' link yet; see #0778).
- Other file links that should open locally (failed tests list, FailedTestsList.vue).

Setting the key by hand is not enough on a normal install, because the server routes (src/server/routes/copy-inspector.ts ~46, ~97) are also dev-gated.

## Desired UX
- One general setting, for example editor.command (with {file} and {line} placeholders, as dev.inspector.editorCommand already uses), shown in Settings > General with clear copy and a Test button or example.
- It is always visible in Settings and documented in repoos.toml.
- Every 'Open in editor' link uses it. dev.inspector.editorCommand still overrides it when set, so the copy inspector behaves as before.
- Links appear only when an editor is configured, with a hint that points to the setting when none is.

## Acceptance criteria
- Setting key added to getConfigSchema() with a Settings control in General, and a test (AGENTS.md).
- Task Spec and Repo Context doc 'Open in editor' use the general setting when no dev.inspector override is set.
- dev.inspector.editorCommand still takes precedence when both are set.
- Decision recorded in the task body: whether opening local files is allowed on a normal (non-dev) install. Opening a local file runs a command, so the route must only accept the configured command template (no shell injection, no arbitrary paths outside the repo's worktree and docs). Document the chosen security boundary in docs/.
- Light and dark themes checked on the link and the Settings control.

## Notes for AI
Start from dev.inspector.editorCommand in src/core/config.ts (~2755-2771, ~2901), the copy-inspector routes (src/server/routes/copy-inspector.ts), TaskDrawer.vue editorConfigured (~1783) and openTaskInEditor. Source: user report 2026-10-15 — editor needs to be configurable for task specs and context files, not only the dev inspector.

## Decision
Opening local files is allowed on normal (non-dev) installs when an editor command is configured. The route no longer requires the dev UI build; it only runs the configured command template as an argv array (no shell), and only opens realpath-resolved paths inside the repo's worktree/docs/test files. dev.inspector.editorCommand still overrides editor.command when set, preserving the copy inspector's prior behavior and its dev-enabled gate.

## Shots
```json
[
{
  "label": "Task drawer Spec row Open in editor (dark)",
  "target": "default",
  "route": "/work?task=0790&tab=details",
  "highlight": "[data-test-id=\"open-in-editor\"]",
  "steps": [
    {
      "waitFor": "[data-test-id=\"open-in-editor\"]"
    }
  ],
  "theme": "dark"
},
{
  "label": "Repo Context doc Open in editor (light)",
  "target": "default",
  "route": "/repo?tab=docs&doc=docs/open-in-editor.md",
  "highlight": "[data-test-id=\"context-open-in-editor\"]",
  "steps": [
    {
      "waitFor": "[data-test-id=\"context-open-in-editor\"]"
    }
  ],
  "theme": "light"
},
{
  "label": "Settings General editor command (light)",
  "target": "default",
  "route": "/settings?tab=general",
  "highlight": "#setting-editor\\.command",
  "theme": "light"
},
{
  "label": "Settings General editor command (dark)",
  "target": "default",
  "route": "/settings?tab=general",
  "highlight": "#setting-editor\\.command",
  "theme": "dark"
}
]
```

## Activity

- 2026-10-15T06:33:35Z · created · njachowski@gmail.com
- 2026-10-15T06:34:25Z · model_override
- 2026-10-15T06:34:26Z · status inbox→ready
- 2026-10-15T06:34:28Z · status ready→active, branch
- 2026-10-15T06:41:52Z · agent exited with an error (opencode) · network problem reaching the model provider, not a code issue: ConnectionRefused: Unable to connect. Is the computer able to access the url?
- 2026-10-15T07:17:53Z · body
- 2026-10-15T07:18:40Z · body
- 2026-10-15T07:20:03Z · body
- 2026-10-15T07:20:42Z · body
- 2026-10-15T07:25:27Z · body: section Decision
- 2026-10-15T07:26:09Z · body
- 2026-10-15T07:32:55Z · status active→review
- 2026-10-15T07:34:02Z · note: review pass 1: needs some work
- 2026-10-15T07:34:02Z · status review→active
- 2026-10-15T07:36:34Z · body
- 2026-10-15T07:37:24Z · body
- 2026-10-15T07:39:21Z · body
- 2026-10-15T07:44:32Z · body: section Shots
- 2026-10-15T07:44:58Z · status active→review
- 2026-10-15T07:45:36Z · note: highlight [data-test-id="open-in-editor"] matched nothing on /work?task=0790
- 2026-10-15T07:46:11Z · note: review pass 2: needs some work
- 2026-10-15T07:46:11Z · message_queued at 2026-10-15T07:46:11.986Z
- 2026-10-15T07:46:12Z · status review→active
- 2026-10-15T07:51:34Z · status active→review
- 2026-10-15T07:51:35Z · note: shots: skipped — 3 handoff shots already captured for this exact plan (f6163ecba) during finalization (#0734)
- 2026-10-15T07:51:35Z · note: shots: skipped — 3 handoff shots already captured for this exact plan (f6163ecba) during finalization (#0734)
- 2026-10-15T07:52:50Z · note: review pass 3: needs some work
- 2026-10-15T08:12:20Z · status review→active
- 2026-10-15T08:12:20Z · note: Verdict needs some work — The implementation adds editor.command, ungates open-in-editor routes, wires Task/Context/FailedTests UI, documents the security boundary, and unit tests cover schema, routes, and drawer behavior. Handoff UI evidence does not satisfy the task drawer shot or the light/dark theme criterion.
- 2026-10-15T08:12:21Z · message_delivered: 1 message(s)
- 2026-10-15T08:13:33Z · needs_input (dev-error) dismissed by hello@repoos.org
- 2026-10-15T08:14:39Z · body
- 2026-10-15T08:16:45Z · body: section Shots
- 2026-10-15T08:17:51Z · body
- 2026-10-15T08:21:13Z · body
- 2026-10-15T08:21:46Z · body: section Decision
- 2026-10-15T08:29:35Z · status active→review
- 2026-10-15T08:30:46Z · note: click .theme-toggle: click: Timeout 5000ms exceeded. on /work?task=0790&tab=details
- 2026-10-15T08:31:42Z · note: review pass 4: needs some work
- 2026-10-15T08:31:42Z · needs_input
- 2026-10-15T09:47:19Z · status review→active
- 2026-10-15T09:47:28Z · needs_input
- 2026-10-15T09:47:50Z · body: section Shots
- 2026-10-15T09:56:09Z · body
- 2026-10-15T10:00:47Z · body
- 2026-10-15T10:02:06Z · body
- 2026-10-15T10:07:23Z · status active→review
- 2026-10-15T10:08:20Z · note: highlight [data-test-id="open-in-editor"] matched nothing on /work?task=9999&tab=details
- 2026-10-15T10:09:44Z · note: review pass 5: needs some work
- 2026-10-15T10:09:45Z · needs_input
- 2026-10-15T10:09:57Z · note: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:65515/api/tasks/9999 (http://127.0.0.1:65515/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:65515/api/tasks/9999)
- 2026-10-15T10:10:21Z · body: section Shots
- 2026-10-15T10:11:57Z · body
- 2026-10-15T10:18:57Z · body
- 2026-10-15T10:20:42Z · body
- 2026-10-15T10:28:14Z · body
- 2026-10-15T10:30:21Z · cli_override, model_override
- 2026-10-15T10:30:25Z · status review→active
- 2026-10-15T10:30:31Z · needs_input
- 2026-10-15T10:31:03Z · message_queued at 2026-10-15T10:31:03.884Z
- 2026-10-15T10:31:42Z · body: section Shots
- 2026-10-15T10:32:46Z · body
- 2026-10-15T10:34:20Z · body
- 2026-10-15T10:35:22Z · status active→review
- 2026-10-15T10:35:41Z · note: highlight [data-test-id="open-in-editor"] matched nothing on /work?task=9999&tab=details
- 2026-10-15T10:35:55Z · note: highlight [data-test-id="open-in-editor"] matched nothing on /work?task=9999&tab=details
- 2026-10-15T10:37:04Z · note: review pass 6: needs some work
- 2026-10-15T10:37:05Z · needs_input
- 2026-10-15T10:42:39Z · body: section Shots
- 2026-10-15T10:42:55Z · note: ui verification failed (4 issue(s)): [request] HTTP 404 for http://127.0.0.1:55861/api/tasks/9999 (http://127.0.0.1:55861/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:55861/api/tasks/9999); [request] HTTP 404 for http://127.0.0.1:55861/api/tasks/9999 (http://127.0.0.1:55861/api/tasks/9999); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:55861/api/tasks/9999)
- 2026-10-15T10:42:58Z · message_delivered: 1 message(s)
- 2026-10-15T10:44:04Z · body: section Shots
