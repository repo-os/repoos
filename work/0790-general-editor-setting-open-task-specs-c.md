---
id: "0790"
title: "General editor setting: open task specs, context docs and files in the user's editor"
type: feature
status: ready
priority: p2
area: [web, server, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
model_override: opencode-go/cat-jam-free
created_at: "2026-10-15T06:33:35Z"
updated_at: "2026-10-15T06:34:26Z"
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

## Activity

- 2026-10-15T06:33:35Z · created · njachowski@gmail.com
- 2026-10-15T06:34:25Z · model_override
- 2026-10-15T06:34:26Z · status inbox→ready
