---
id: "0205"
title: Show loading state instead of premature offline in web UI
type: bug
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-loading-state-instead-of-premature-
model_override: default
created_at: "2026-08-15T03:38:05Z"
updated_at: "2026-08-15T08:50:09Z"
---
## Problem

When the web UI is reloaded, the top-right corner shows "offline" for a few seconds. At that point the app is really just starting up or loading, not offline. Showing "offline" during startup is misleading and can confuse users into thinking the connection to the server is broken when it is not.

## Desired UX

While the UI is starting up or loading, the top-right corner should show a loading/starting state (e.g. "loading" or similar) instead of "offline". It should only show "offline" when the connection is genuinely offline — i.e. once startup has completed and the app has actually determined it is not connected.

## Acceptance criteria

- [ ] On reload, the top-right corner no longer shows "offline" during the initial startup/loading period.
- [ ] During startup/loading, the top-right corner shows a loading or starting indicator (e.g. "loading").
- [ ] "offline" is only shown once the app has genuinely determined it is offline.
- [ ] Once the app is loaded and connected, the normal online state is shown.

## Notes for AI

- The fix lives in the web UI status/connection indicator logic that renders the top-right corner.
- Distinguish between "app is starting up / not yet determined" and "app is offline". The initial/unknown state should default to a loading indicator, not offline.
- Do not change the actual connection-detection mechanism unless needed; this is primarily about what is shown during the startup window.
- Assumption: a "loading" label is an acceptable default indicator; a loading spinner or icon is a reasonable alternative if the UI has one.

## Related

- `src/ui-app` web UI components

## Activity

- 2026-08-15T03:38:05Z · created · unknown
- 2026-08-15T04:16:13Z · status inbox→ready
- 2026-08-15T04:16:18Z · status ready→active, branch
- 2026-08-15T04:43:02Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T05:26:26Z · model_override
- 2026-08-15T08:50:09Z · status review→done, release:success
