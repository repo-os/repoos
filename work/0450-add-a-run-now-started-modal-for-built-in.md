---
id: "0450"
title: Add a 'Run now' started modal for built-in team agents
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: ""
branch: ""
review_model_override: opencode-go/hy3
created_at: "2026-09-19T16:38:12Z"
updated_at: "2026-09-19T17:36:07Z"
---
## Problem

Clicking 'Run now' on a built-in team agent gives no feedback until the full synchronous run completes — which can take several minutes. The user has no indication the run started, no sense of how long to expect, and no clue where to look for results. The natural reaction is to sit and watch the spinner, not navigate away.

## Desired behaviour

Immediately on clicking 'Run now' (before the API call resolves), show a small informational modal that:

1. Names the agent and summarises in 1–2 sentences what it will do (agent-specific copy, see below).
2. Tells the user roughly how long to expect ('usually takes 1–3 minutes').
3. Explains where results appear ('findings will appear as a new task in your inbox when the run is complete').
4. Has a single 'Got it' button to dismiss. The run continues in the background — the modal is informational only, not a progress tracker.

The modal should close automatically if the user clicks 'Got it' OR if the run finishes before they do (the existing inline result banner on the card is the right post-run surface — still show it).

## Agent-specific copy

Use the descriptions already in BuiltInAgentCard.vue as the source of truth:

- **Performance Agent** — 'Scans for performance issues like slow functions, blocking operations, deeply nested loops, unbounded memory growth, and duplicate computations. Findings are bundled into one inbox task.'
- **Tech Debt Agent** — 'Scans for technical debt patterns including outdated dependencies, code duplication, high-complexity files, unused code, and deprecated APIs. Findings are bundled into one inbox task.'
- **Design Agent** — 'Reviews your web UI for layout issues, styling inconsistencies, accessibility gaps, and UX friction. Findings and proposed fixes are bundled into one inbox task.'
- **Architect Agent** — 'Analyses your codebase for tight coupling, missing abstractions, scalability risks, and over-engineering. Findings are bundled into one inbox task.'
- **Docs Debt Agent** — 'Verifies that AGENTS.md and your project docs still match the code — checks file paths, symbols, and stated constraints. Stale references it can fix automatically are committed; anything that needs a human decision is bundled into one inbox task.'

## Implementation notes

- Modal must use Teleport to body (AGENTS.md rule) so it renders above the card stacking context.
- No new API call needed — the modal fires client-side the moment runNow() is invoked, before the await api(...).
- Keep the existing inline banner (message/error) after run completion — the modal is a walk-away notice, not a replacement for the result.
- A ref<boolean> showStartedModal per card is sufficient state.

## Activity

- 2026-09-19T16:38:12Z · created · unknown
- 2026-09-19T17:36:07Z · review_model_override
