---
id: "0806"
title: "Easter eggs bundle: make 'Set editor in Settings → General' a link to that section"
type: feature
status: done
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-16T09:46:29Z"
updated_at: "2026-10-16T10:03:44Z"
---
## Problem
Where Open in editor is unavailable because no editor is set, the hint reads 'Set editor in Settings → General' but is plain text. Now that Settings sections have URLs (#0800), the hint should take the user straight there.

Places: src/ui-app/src/components/TaskDrawer.vue (the Spec row hint, data-test-id open-in-editor-hint, around line 5021), src/ui-app/src/components/FailedTestsList.vue (failed-test-open-hint, around line 74; it says only 'Set editor'), and src/ui-app/src/views/ContextView.vue (context-open-in-editor-hint, around line 483).

The editor setting (editor.command) is in the General section, so the link target is /settings?tab=general&section=general.

## Desired UX
- The hint text is a link to /settings?tab=general&section=general. Clicking it opens Settings at the editor setting.
- The link has the same look as other text links in the app, and is keyboard focusable.
- The FailedTestsList hint reads 'Set editor in Settings → General' like the others, so the wording is consistent.

## Acceptance criteria
- Test: each of the three hints renders a link to /settings?tab=general&section=general.
- Test: keyboard focus reaches the link and Enter follows it.
- Light and dark themes checked.

## Notes for AI
Use the router's link component so the navigation stays in the app. Keep the aria-label wording. Source: user request 2026-10-16.

## Activity

- 2026-10-16T09:46:29Z · created · njachowski@gmail.com
- 2026-10-16T10:03:44Z · status inbox→done
- 2026-10-16T10:03:44Z · note: superseded by #0805
