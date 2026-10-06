---
id: "0706"
title: "Standalone self-check: prefer least-loaded remote host and stuck-badge copy"
type: chore
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T03:37:47Z"
updated_at: "2026-10-06T03:37:48Z"
---
## Problem

#0695 review round 1 (item 6): least-loaded host preference for standalone `repoos check` self-checks (beyond the existing pool `active` sort) and transcript/stuck-badge copy were called out but not implemented in that task.

## Desired UX

Standalone engineer self-checks pick the idlest eligible Tailscale host when multiple are free; UI/transcript copy reflects queued/stuck remote runs clearly.

## Acceptance criteria

- Document or implement any host-pick change beyond current least-`active` dispatch; stuck-badge/transcript strings reviewed.

## Activity

- 2026-10-06T03:37:47Z · created · unknown
- 2026-10-06T03:37:48Z · needs_input
