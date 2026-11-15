---
id: "1133"
title: "Agents page: replace the Default agents last-runs log with a per-agent status dot"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-15T15:20:08Z"
updated_at: "2026-11-15T15:20:10Z"
---
## Problem
The Default agents section of Agents > Agents now starts with a "last runs" log, added in #1098 (12 Nov) and reworked in #1123 (15 Nov). It lists rows such as CTO, debugger, engineer, pm and reviewer, each with a "finished · <timestamp>" line, plus a "Show older and other runs (14)" toggle. Nick didn't ask for it and finds it badly designed:
- A log of timestamps sits above the controls he actually uses (each agent's coding agent, model, instructions and skills).
- The engineer failure row repeats its sentence twice: "OpenCode exited with an error. Open Raw CLI error for details. (CLI: OpenCode exited with an error. Open Raw CLI error for details."
- The list repeats what the agent cards below already show.

## Desired UX
Remove the separate last-runs list from the top of Default agents. Each agent card gets a small status dot with a short label next to its name, such as "Last run 21:40" or "Failed 21:36". Tapping it shows the plain-language failure reason and the collapsed "Raw CLI error". When everything is healthy, nothing extra takes up space.

## Acceptance criteria
- The last-runs block and its "Show older and other runs" toggle are gone from the top of Default agents.
- Each default agent card (plus CTO and debugger) shows its last run status inline. The failure detail opens on demand and uses `formatAgentFailure`/`splitAgentFailureDetail` from #1123.
- The failure summary never repeats itself. Fix the formatter so the "(CLI: …)" suffix doesn't repeat the summary, and add a test with the OpenCode string above.
- Older runs remain reachable from the activity log, not from this page header.
- UI tests are updated, and the layout is checked at 1280px and at phone width.

## Activity

- 2026-11-15T15:20:08Z · created · t@t
- 2026-11-15T15:20:10Z · needs_input
