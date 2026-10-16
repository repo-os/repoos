---
id: "0805"
title: "Easter eggs bundle: Copilot event lines, and Set editor hints as links"
type: bug
status: active
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-copilot-event-lines-a
created_at: "2026-10-16T08:55:26Z"
updated_at: "2026-10-16T12:24:56Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
One open easter-eggs bundle, collecting small, independent fixes. Items:

1. Copilot 'unknown protocol event' lines for user.message and assistant.idle in the PM chat (src/server/agents.ts, around line 2030). Both are internal events the chat already shows, so they should not show as unknown.
2. 'Set editor in Settings → General' hints are plain text. Make them links to /settings?tab=general&section=general in the Task drawer Spec row (TaskDrawer.vue, open-in-editor-hint), the Context doc viewer (ContextView.vue, context-open-in-editor-hint) and the failed tests list (FailedTestsList.vue, failed-test-open-hint, which currently says only 'Set editor'). Supersedes #0806.

## Desired UX
- Item 1: the two events produce no transcript line; any other unknown event still shows the line.
- Item 2: each hint is a keyboard-focusable link that opens the editor setting; the wording matches across all three places.

## Acceptance criteria
- Test: a user.message event and an assistant.idle event produce no transcript entry.
- Test: an unrecognised event type still produces the unknown-event line.
- Test: each of the three hints renders a link to /settings?tab=general&section=general.
- Test: keyboard focus reaches the link and Enter follows it.
- Light and dark themes checked on the hints.

## Notes for AI
Commit per item so a reviewer can read them separately. Use the router's link component for item 2. Keep the aria-label wording. Marks superseded when landed: #0806. Source: user reports 2026-10-16.

## Shots
```json
[
{
"label": "Task drawer Spec row — editor hint link (dark)",
"target": "default",
"route": "/work?task=0805&tab=details",
"highlight": "[data-test-id=\"open-in-editor-hint\"]",
"state": "editor:unconfigured",
"theme": "dark"
},
{
"label": "Task drawer Spec row — editor hint link (light)",
"target": "default",
"route": "/work?task=0805&tab=details",
"highlight": "[data-test-id=\"open-in-editor-hint\"]",
"state": "editor:unconfigured",
"theme": "light"
},
{
"label": "Context doc viewer — editor hint link (dark)",
"target": "default",
"route": "/repo?doc=docs/README.md",
"highlight": "[data-test-id=\"context-open-in-editor-hint\"]",
"state": "editor:unconfigured",
"theme": "dark"
}
]
```

## Activity

- 2026-10-16T08:55:26Z · created · njachowski@gmail.com
- 2026-10-16T09:42:43Z · body
- 2026-10-16T10:04:30Z · area, body
- 2026-10-16T10:04:40Z · title
- 2026-10-16T10:25:54Z · status inbox→ready
- 2026-10-16T11:55:05Z · status ready→active, branch
- 2026-10-16T12:00:45Z · body
- 2026-10-16T12:02:57Z · body: section Shots
- 2026-10-16T12:05:44Z · body
- 2026-10-16T12:07:18Z · body
- 2026-10-16T12:14:39Z · status active→review
- 2026-10-16T12:14:55Z · note: highlight [data-test-id="open-in-editor-hint"] matched nothing on /work?task=0805&tab=details
- 2026-10-16T12:14:58Z · note: highlight [data-test-id="context-open-in-editor-hint"] matched nothing on /repo?doc=docs/README.md
- 2026-10-16T12:15:44Z · note: review pass 1: needs some work
- 2026-10-16T12:15:45Z · status review→active
- 2026-10-16T12:17:28Z · body: section Shots
- 2026-10-16T12:18:52Z · body
- 2026-10-16T12:20:38Z · body
- 2026-10-16T12:24:56Z · body
