---
id: "0730"
title: "The CTO's 'needs a decision' digest: only what policy cannot handle, with cause and evidence attached"
type: feature
status: review
priority: p2
area: [server, web]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/the-cto-s-needs-a-decision-digest-only-w
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T02:05:38Z"
updated_at: "2026-10-07T10:37:41Z"
---
## Problem

A driver (human or AI) had to reconstruct 'what needs me, and why' from task files, locks, checks.db and logs. The attention feed lists items but not always the cause, the evidence and the suggested next step.

## Desired UX

- One endpoint, one CLI command (`repoos attention` or similar; see #0723) and one UI panel listing only items that automation did not or cannot resolve: failed handoff/close-out with the extracted cause (failing test names, step, host) and links to the evidence (check run id, log path), reviews that disagree with the gate, decisions that need the owner (config, hosts, release), stuck/hung runs.
- Each item names the safe actions available (retry, re-request review, merge main into branch, restart fresh) and which ones the policy would take automatically.

## Acceptance criteria

- Tests for item classification, cause extraction and the action list. UI uses the shared components. Docs. repoos check passes.

## Notes for AI

Read src/server/attention-feed.ts and the done-error debug tl;dr first and reuse them. Related: #0720, #0723.

## Framing (2026-10-07)

This digest is the CTO's escalation surface: what it did automatically (audit) and what it is handing to the human, with cause and evidence.

## Activity

- 2026-10-07T02:05:38Z · created · unknown
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:14Z · title, body
- 2026-10-07T09:29:38Z · status inbox→ready
- 2026-10-07T09:46:40Z · cli_override, model_override
- 2026-10-07T09:46:40Z · status ready→active, branch
- 2026-10-07T10:37:41Z · status active→review
