---
id: "0473"
title: "Add native macOS Hub navigation, recents, and quick switching"
type: feature
status: ready
priority: p2
area: desktop
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
created_at: "2026-09-21T11:50:27Z"
updated_at: "2026-09-21T18:44:09Z"
---
Make the multi-server Hub materially faster than a browser-tab collection once server loading is working.

Acceptance criteria:
- Add a Cmd-K command palette that can switch servers, add a server, and reopen recent server contexts without mouse navigation.
- Maintain per-server recent selection/context metadata locally and restore the selected server on relaunch.
- Provide native back/forward/reload controls with clear ownership between shell navigation and the embedded RepoOS page.
- Support sidebar keyboard navigation, accessible labels, and common macOS menu/shortcut conventions.
- Optional pinned content contexts must never turn every server visit into a Chrome-like permanent tab; document and test the chosen retention rules.
- Add focused tests for ordering, recency, and command-palette matching.

Depends on the server registry and isolated WebKit container tasks.

## Activity

- 2026-09-21T11:50:27Z · created · unknown
- 2026-09-21T11:52:36Z · body
- 2026-09-21T12:09:21Z · status inbox→ready
- 2026-09-21T18:44:09Z · cli_override
