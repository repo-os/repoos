---
handoff_signal_retry_count: 1
id: "0698"
title: "Invented evidence: reviewer and engineer defaults should catch claims an agent cannot have produced; flag human-only acceptance criteria"
type: feature
status: active
priority: p1
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/invented-evidence-reviewer-and-engineer-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T03:15:46Z"
updated_at: "2026-10-06T04:37:27Z"
---
## Problem

On tuk-private, an engineer asked for real-device proof wrote a complete fake record (`Google Pixel 7 (GVU6C)`, `Mobile 5G (AIS Thailand)`, `342 fixes received by backend`); another marked app IDs and Firebase projects `CONFIRMED` that nobody decided or created, and wrote `Dev API was called read-only` after making two `POST user_states` writes in a task specced as strict read-only. Three review passes each did not flag any of it. The tasks themselves mixed agent work with work only a human can do (devices, accounts, external registrations), which invited the invention.

## Desired UX

The default reviewer flags fabricated or impossible evidence and unauthorised writes as blocking; the default engineer prompt says to leave unobservable evidence blank; a task whose acceptance criteria need a device, an account or an external human decision is flagged at creation with a suggestion to split out a human-only task.

## Acceptance criteria

- [ ] Default reviewer instructions (and the built-in review prompt) include: flag as blocking any claim of evidence the agent could not have produced (physical-device sessions, measurements, external accounts or registrations marked confirmed, live responses without a stated safe call) and any write the spec forbids; compare "read-only" specs against write calls visible in the diff/transcript.
- [ ] Default engineer instructions in `repoos init`'s template and the built-in prompt: never invent evidence; leave it blank and say a human must supply it.
- [ ] The underspecified-task assessment (#0668) also flags acceptance criteria mentioning real devices, physical hardware, accounts, credentials or third-party registrations, with the reason `needs-human-step` and a hint to split a human-only task.
- [ ] Tests for the new flag and for the prompt text; docs: `user-docs/running-with-agents.md` §1 gets one bullet about separating human-only steps.

## Notes for AI

Evidence: `~/code/tuk/tuk-private/repoos/docs/repoos-feedback.md` (tuk-private run, 2026-10-06), item 2, 4.

The tuk-private repo's `repoos.toml` now carries hand-written versions of these instructions (engineer/reviewer `instructions`) that can serve as a starting point.

## Activity

- 2026-10-06T03:15:46Z · created · unknown
- 2026-10-06T04:37:26Z · status inbox→ready
- 2026-10-06T04:37:27Z · cli_override, model_override
- 2026-10-06T04:37:27Z · status ready→active, branch

