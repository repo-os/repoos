---
id: "0636"
title: Show 'Open in editor' link on task detail when editor is configured
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: openrouter/openrouter/auto
review_cli_override: pi
review_model_override: openrouter/openrouter/auto-beta
created_at: "2026-10-03T08:23:48Z"
updated_at: "2026-10-03T08:37:15Z"
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

## Scope
In scope: adding the link and open-in-editor behavior to the task detail page.
Deferred: adding a new settings UI for editor selection if it doesn't exist; configuring the editor via repoos.toml is acceptable.

## Related
None specified.

## Original prompt

If the user has configured an editor let's show an "Open in editor ->" on the same line as the "Spec" label, but right aligned, in the same style as "go to story ->" above it. If they click "open in editor ->" it shoudl open the task md file in their configured editor (e.g. zed in my case). if they don't have an editor configured you could either hide it or tell them to configure their preferred editor in the settings or repoos.toml.

## Screenshots

![Screenshot-2026-10-03-at-16.03.51](/api/tasks/0636/attachments/screenshot-1.png)

## Activity

- 2026-10-03T08:23:48Z · created · hello@repoos.org
- 2026-10-03T08:23:49Z · screenshots
- 2026-10-03T08:24:08Z · status draft→inbox, title, area, body
- 2026-10-03T08:36:52Z · model_override
- 2026-10-03T08:37:07Z · review_cli_override
- 2026-10-03T08:37:15Z · review_model_override
