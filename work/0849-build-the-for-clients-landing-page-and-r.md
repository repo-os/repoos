---
id: "0849"
title: Build the For Clients landing page and Resend project enquiry form
type: feature
status: ready
hold: true
priority: p2
area: landing
assigned_to: human
created_by: njachowski@gmail.com
branch: codex/0849-for-clients
created_at: "2026-10-19T10:22:29Z"
updated_at: "2026-10-19T10:45:26Z"
---
## Problem
The human approved the For Clients prototype and wants it implemented in the existing landing app. This interactive Codex session owns implementation; do not dispatch a built-in engineer.

## Desired UX
Add /for-clients and For Clients after Docs in desktop and mobile navigation. Reproduce the approved prototype design and content integrated with the existing Vue app, layout, theme controls and tokens. Use we/our throughout service copy instead of I/me/my. Preserve the hero, illustrative project board, assurances, project categories, engagement process, ownership/handover section, FAQs, and closing CTA. No project showcase yet: deferred task #0848 stays on hold.

The enquiry form asks for name/company, work email, project/problem, and timing. Submit securely through Resend to fixed recipient hello@repoos.org with visitor email as reply-to. Include accessible sending, success, and failure states. Keep credentials server-side, validate inputs and origin, cap request size and protect against abuse. No new runtime dependencies.

## Acceptance criteria
- Approved design/content at /for-clients within landing/, responsive, using existing theme tokens across Classic/Gruvbox and dark/light.
- Shared desktop/mobile navigation, footer and theme handoff work. Deep links load correctly.
- Royal we service copy; illustrative content labelled; no case studies yet.
- Work email required; server-side Resend endpoint sends to hello@repoos.org. No secrets in source, browser bundles, tasks or logs.
- Meaningful endpoint/UI tests cover validation, success, failure, duplicate/sending protection and privacy. Landing build and applicable RepoOS checks pass.
- Document deployment configuration and production prerequisites. Do not deploy production in this request.
- Hand off through RepoOS review; no manual merge.

## Notes for AI
Approved source: /Users/nick/.codex/visualizations/2026/10/19/01a153a4-3ed7-79b1-8225-9d5655731147/for-clients/index.html . Keep assigned_to human and hold true during this interactive implementation. Read AGENTS.md, landing/README.md and relevant docs. Landing currently uses static Cloudflare Workers assets; add the smallest appropriate server-side handler without exposing the RepoOS control plane. User authorizes enquiries to hello@repoos.org. Tests use fake credentials and mocked email delivery. Attachments: approved prototype preview and existing landing navigation reference.

## Human task

_Assigned to a human, not an AI agent. No `## Notes for AI` is required here; the acceptance criteria are the human's checklist._

## Screenshots

![for-clients-preview](/api/tasks/0849/attachments/att_073af8fb-f014-4a11-a858-c4567b685fdd.png)
![Screenshot-2026-10-19-at-18.12.35](/api/tasks/0849/attachments/att_a6c7a170-befa-4417-9893-1fec5577ea3b.png)

## Activity

- 2026-10-19T10:22:29Z · created · njachowski@gmail.com
- 2026-10-19T10:22:30Z · screenshots
- 2026-10-19T10:22:42Z · status inbox→active
- 2026-10-19T10:23:20Z · branch
- 2026-10-19T10:45:26Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
