---
id: "0471"
title: Build the macOS Hub server registry and sidebar workspace
type: feature
status: done
priority: p1
area: desktop
assigned_to: ai
created_by: ""
branch: feat/build-the-macos-hub-server-registry-and-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-09-21T11:50:25Z"
updated_at: "2026-09-21T18:43:36Z"
---
Implement the first useful native Hub workflow: users can maintain a local list of RepoOS servers and switch among them from a macOS-native sidebar.

Acceptance criteria:
- Add/edit/remove/reorder locally stored server entries with display name, HTTPS origin, optional color/icon, group, and pinned state.
- Normalize URLs and require HTTPS; validate a new or edited server with GET /api/health and a bounded timeout before saving.
- The sidebar supports pinned and grouped servers, shows selection and simple reachability state, and restores the most recent selection at launch.
- Connection failures are actionable and do not erase an existing saved entry.
- The window has a clear empty state and an accessible server-management flow.
- Data never leaves the device except the user-initiated health check and later selected-server navigation.
- Include focused unit tests for registry persistence, URL validation, and reachability-state transitions.

Depends on the approved macOS Hub architecture and the standalone project scaffold. This task must not attempt cross-server task aggregation yet.

## Activity

- 2026-09-21T11:50:25Z · created · unknown
- 2026-09-21T11:52:34Z · body
- 2026-09-21T12:06:56Z · status inbox→ready
- 2026-09-21T18:23:56Z · cli_override
- 2026-09-21T18:23:57Z · cli_override
- 2026-09-21T18:24:11Z · model_override
- 2026-09-21T18:25:48Z · model_override
- 2026-09-21T18:26:03Z · status ready→active, branch
- 2026-09-21T18:29:09Z · status active→review
- 2026-09-21T18:43:36Z · status review→done, release:success
