---
id: "1092"
title: "Release email: repoos release email --preview CLI subcommand"
type: feature
status: ready
priority: p3
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T05:28:20Z"
updated_at: "2026-11-12T00:10:48Z"
---
## Problem
Release emails (#1071) have a preview endpoint, GET /api/release/email/preview, that renders the subject, HTML and text for a version without sending. It is reachable only through `repoos api`. Maintainers who want to check the rendered message from a terminal have no first-class command, and the repo's CLI parity rule expects one.

## Acceptance criteria
1. `repoos release email --preview <version>` prints the rendered subject, then the HTML and plain-text bodies, and sends nothing.
2. The route it calls is the existing preview route, and the command is registered for CLI parity in src/cli/api-route-parity.ts.
3. A test covers the command's output for a recorded version and its error for an unknown one.

## Notes for AI
Start from src/server/routes/release.ts (getReleaseEmailPreview) and src/cli. Do not send any email. Keep zero runtime dependencies.

## Activity

- 2026-11-11T05:28:20Z · created · njachowski@gmail.com
- 2026-11-11T05:28:21Z · needs_input
- 2026-11-11T05:28:37Z · body: Problem (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-11T07:43:59Z · needs_input
- 2026-11-12T00:10:48Z · status inbox→ready
