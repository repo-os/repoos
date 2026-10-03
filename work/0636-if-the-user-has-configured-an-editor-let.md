---
id: "0636"
title: Show 'Open in editor' link on task detail when editor is configured
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-open-in-editor-link-on-task-detail-
model_override: openrouter/openrouter/auto
review_cli_override: pi
review_model_override: openrouter/openrouter/auto-beta
created_at: "2026-10-03T08:23:48Z"
updated_at: "2026-10-03T09:39:47Z"
last_check_failure: "repoos check at 2026-10-03T09:39:20.093Z: server-side finalization timed out (deadline exceeded)"
review_rounds: 1
review_passes: 1
---
## Problem
The task detail view shows a "Spec" label, but there's no quick way to open the underlying task markdown file in the user's configured editor. When an editor is configured, users should have a right-aligned "Open in editor ->" link on the same line as the "Spec" label (matching the "go to story ->" style above it). Without a configured editor, the link should either be hidden or prompt the user to configure their preferred editor in settings or repoos.toml.

## Desired UX
- On the task detail page, next to the "Spec" label, a right-aligned "Open in editor ->" link appears in the same style as "go to story ->".
- Clicking it opens the task's markdown file in the user's configured editor (e.g., zed).
- If no editor is configured, either hide the link or show a message directing the user to configure their preferred editor in settings or repoos.toml.

## Acceptance criteria
- [ ] When a preferred editor is configured, "Open in editor ->" appears right-aligned on the same line as the "Spec" label, styled like "go to story ->"
- [ ] Clicking the link opens the task's `.md` file in the configured editor
- [ ] When no editor is configured, the link is hidden or replaced with instructions to configure an editor in settings/repoos.toml

## Notes for AI
- Only touch the web UI (task detail view). Do not change task formats or editor config schema.
- Assumption: "configured editor" refers to a user-level editor preference (e.g., in settings or repoos.toml), not a hard-coded list.
- If the editor config setting doesn't exist yet, note it in Notes for AI rather than inventing a new settings tab unrequested.
- Match existing "go to story ->" link styling exactly.
- Defer: no new settings UI required unless the config mechanism is missing.

Implementation notes (filled in by the engineer):
- The editor setting already exists: `dev.inspector.editorCommand` (Settings → Advanced → "Copy inspector: editor command", e.g. `zed {file}:{line}`). The link reuses it; no new setting or Settings tab was added.
- Task markdown lives under `work/`, but the existing open endpoint (`/api/dev/copy-inspector/open`) only accepts `src/` paths. A sibling route, `POST /api/dev/open-in-editor`, launches the same editor command for the task file. No config-schema change.
- The new route is scoped to task files: the resolved path must sit under the configured work dir and carry a task extension (`isTaskFilePath`), so a direct call cannot open `.env`, source, or other repo files.
- `resolveRepoFileTarget` realpath-resolves both the repo root and the target and requires the real target to stay inside the real root, so a symlink pointing out of the repo is refused.
- The link only renders when it can actually work: a non-empty editor command, `dev.inspector.enabled` not false, and `repo.health.copyInspectorAvailable` (the dev-only API gate). Otherwise it is hidden, per the accepted "hide" option.
- The link uses `aria-label` only; no native `title` tooltip (repo convention).

## Scope
In scope: adding the link and open-in-editor behavior to the task detail page.
Deferred: adding a new settings UI for editor selection if it doesn't exist; configuring the editor via repoos.toml is acceptable.

## Related
None specified.

## Original prompt

If the user has configured an editor let's show an "Open in editor ->" on the same line as the "Spec" label, but right aligned, in the same style as "go to story ->" above it. If they click "open in editor ->" it shoudl open the task md file in their configured editor (e.g. zed in my case). if they don't have an editor configured you could either hide it or tell them to configure their preferred editor in the settings or repoos.toml.

## Screenshots

![Screenshot-2026-10-03-at-16.03.51](/api/tasks/0636/attachments/screenshot-1.png)

## Shots
```json
[
  {
    "label": "Task detail Spec row with the new Open in editor link",
    "target": "default",
    "route": "/",
    "selector": ".spec-head",
    "highlight": "[data-test-id=\"open-in-editor\"]",
    "steps": [
      {
        "click": ".task-card"
      },
      {
        "waitFor": "[data-test-id=\"open-in-editor\"]"
      },
      {
        "waitMs": 300
      }
    ]
  }
]
```

## Activity

- 2026-10-03T08:23:48Z · created · hello@repoos.org
- 2026-10-03T08:23:49Z · screenshots
- 2026-10-03T08:24:08Z · status draft→inbox, title, area, body
- 2026-10-03T08:36:52Z · model_override
- 2026-10-03T08:37:07Z · review_cli_override
- 2026-10-03T08:37:15Z · review_model_override
- 2026-10-03T08:39:42Z · status inbox→ready
- 2026-10-03T08:39:46Z · status ready→active, branch
- 2026-10-03T08:44:12Z · body: section Shots
- 2026-10-03T08:44:28Z · body: section Notes for AI
- 2026-10-03T08:51:34Z · status active→review
- 2026-10-03T08:51:45Z · note: shots: failed — capture of Task detail Spec row with the new Open in editor link on "default" failed: click: Timeout 5000ms exceeded.
- 2026-10-03T08:52:14Z · status review→active
- 2026-10-03T09:21:38Z · body: section Notes for AI
- 2026-10-03T09:39:17Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-10-03T09:39:47Z · status active→review
