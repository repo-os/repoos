---
id: "1094"
title: "Release email: rich templates"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T05:28:26Z"
updated_at: "2026-11-11T05:28:40Z"
---
## Problem
The first release-email cut (#1071) renders one plain HTML and text pair. The spec asked for grouped release notes, per-recipient unsubscribe and links that work for non-GitHub hosts. None of these fit the first cut, so they are filed here.

## Acceptance criteria
1. Release notes group into sections (features, fixes, other) in the HTML body.
2. Each recipient gets an unsubscribe link that turns off that address's release emails.
3. Links work for a non-GitHub repository host.
4. Each item has its own tests with fake values.

## Notes for AI
See src/server/release-email.ts (renderReleaseEmail). Keep zero runtime dependencies and send nothing from tests.

## Activity

- 2026-11-11T05:28:26Z · created · njachowski@gmail.com
- 2026-11-11T05:28:27Z · needs_input
- 2026-11-11T05:28:40Z · body: Problem (added); Acceptance criteria (added); Notes for AI (added)
