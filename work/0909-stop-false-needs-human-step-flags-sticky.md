---
id: "0909"
title: "Stop false 'needs human step' flags: sticky overrides, model check before keywords, tagged criteria with auto-split"
type: feature
status: active
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stop-false-needs-human-step-flags-sticky
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T19:41:23Z"
updated_at: "2026-10-22T00:19:46Z"
---
## Problem
The 'needs-human-step' detector flags tasks by keyword (credentials, accounts, device, keys…). 2026-10-22: #0904 (design/implement remote engineer sessions, proven with fakes) was flagged because its criteria merely MENTION credentials; #0904, #0905, #0908 and others were flagged repeatedly and a driver cleared the flag three times, then reworded the task to dodge the scanner. Every edit re-scans and can re-flag, new tasks get flagged on creation, and a flagged task blocks AI dispatch until someone notices. It is brittle and wastes human and driver time.

## Desired UX
A task is flagged only when verifying its acceptance criteria truly requires a human action. A human or driver clearing the flag is remembered and not undone by later edits unless the criteria materially change. When a task genuinely mixes AI-doable and human-only work, RepoOS offers the split instead of just flagging.

## Acceptance criteria
- Sticky override: clearing needs_input (needs-human-step) records a fingerprint of the current acceptance criteria and who cleared it; rescans skip the flag while the fingerprint matches; a material change to the criteria re-evaluates. Tests: clear, edit unrelated section, edit body, change criteria.
- Model check: when the keyword tripwire fires, ask the human-step model check (see model_routing.humanStepCheck in repoos.toml; read how it works first and report whether the keyword scan currently overrides it) whether verification REQUIRES a human, with the matched sentence quoted; the keyword match alone never sets the flag. Record the usage via recordOneShotSession. Tests with fake model answers (requires, merely mentions, ambiguous -> flag with reason).
- Visible reason: the flag detail names the exact sentence and the model's one-line reason; the drawer shows it.
- Tagged criteria: criteria lines may be prefixed [human] or [ai]; only [human] lines can require a human; untagged lines go through the model check. When a task has both tags, a one-click / CLI action (repoos split <id>) creates the held human task (assigned human, depends_on the AI task), moves the [human] lines there and leaves the AI task startable. Tests for the split, including dependency and hold.
- Settings control for the model check and the sticky behaviour, per the Settings-control rule in AGENTS.md; docs updated (user-docs, AGENTS.md human-step paragraph).
- Migration: existing flagged tasks keep working; no frontmatter breakage across work/*.md (parser test).

## Notes for AI
Order of work: sticky override first (smallest, fixes the loop), then the model check, then tags and split. Related: #0908 (human-task board pathway), #0907. Do not weaken the existing safety: a task whose criteria really need a device, account or sign-up must still be flagged.

## Activity

- 2026-10-21T19:41:23Z · created · njachowski@gmail.com
- 2026-10-21T19:48:02Z · status inbox→ready
- 2026-10-21T20:03:47Z · cli_override, model_override
- 2026-10-21T20:19:07Z · status ready→active, branch
- 2026-10-21T20:34:56Z · message_queued at 2026-10-21T20:34:56.324Z
- 2026-10-21T20:34:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T20:52:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T23:51:06Z · engineer stopped by request
- 2026-10-21T23:51:27Z · status active→ready
- 2026-10-21T23:51:37Z · status ready→active
- 2026-10-21T23:51:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T23:51:39Z · message_delivered: 1 message(s)
- 2026-10-22T00:07:15Z · message_queued at 2026-10-22T00:07:15.281Z
- 2026-10-22T00:07:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T00:19:46Z · CTO nudge: held — an undelivered message is already queued
