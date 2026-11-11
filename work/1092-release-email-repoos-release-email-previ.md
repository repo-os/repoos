---
id: "1092"
title: "Release email: repoos release email --preview CLI subcommand"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p3
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T05:28:20Z"
updated_at: "2026-11-11T05:28:21Z"
---
Follow-up from #1071 (acceptance 2). The preview route exists (GET /api/release/email/preview) and is reachable through repoos api, but there is no CLI subcommand. Add repoos release email --preview <version> that prints the rendered subject and bodies without sending, with CLI parity in src/cli/api-route-parity.ts.

## Activity

- 2026-11-11T05:28:20Z · created · njachowski@gmail.com
- 2026-11-11T05:28:21Z · needs_input
