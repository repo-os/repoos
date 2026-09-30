---
id: "0598"
title: Protect a task worktree from edits after handoff to review
type: feat
status: review
needs_input: true
needs_input_reason: review-failed
needs_input_detail: the opencode agent timed out after 900s
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/protect-a-task-worktree-from-edits-after
cli_override: cursor
model_override: composer-2.5
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-30T05:01:28Z"
updated_at: "2026-09-30T06:46:04Z"
review_rounds: 1
review_passes: 1
---
## Problem
#0594 was signed off (reviewer: good to go at 12:29) and Move to done started at 12:36. At 12:37 four source files in its worktree were edited by something outside the runner (engineer and reviewer logs are silent then). Close-out merged only the committed branch tip, kept the dirty worktree, and asked for input. The edits (real bug fixes) did not land and nobody noticed until cleanup. This has reportedly happened several times. Nothing stops writers to a task worktree once the task is in review, and close-out does not check that the tree it validated is the tree it publishes.

## Proposed approach: detect (hard) plus discourage (soft)
1. **Snapshot at handoff.** When finalization moves a task to review, record the branch SHA and a clean-tree fact (`git status --porcelain` empty) in the task's handoff record (.repoos/handoff-requests or the job). Handoff already commits and checks the tree, so this is free.
2. **Pre-flight at Move to done.** In IntegrationOrchestrator before enqueue/sync: if the task worktree is dirty or HEAD differs from the handoff SHA, refuse with a clear message naming the files and what changed ('worktree changed after handoff: …'), instead of running the whole gate first. Offer 'discard' or 'send back to engineer' as the resolution.
3. **Re-check at publish.** Just before publishing (the phase that already rechecks main under the lock), re-run the same check against branchSha recorded in the job. If the worktree went dirty or HEAD moved during close-out, abort with the same message rather than publishing and leaving a dirty leftover.
4. **Soft lock.** Write .repoos/locks/<taskId>.json ({ status: review, sha, at }) while a task is in review or closing out. Agent runners refuse to start an engineer/helper in that worktree while it exists, and the UI shows 'locked: in review'. Sending the task back to active or finishing close-out removes it. This is advisory: external/interactive sessions can still ignore it, which is why 2 and 3 are the real protection.
5. **Attribution (best effort).** When the check finds a dirty tree, record mtimes of the changed files and the time window so the reader can match them to a session.

## Why not hard-lock the filesystem
chmod -R a-w or immutable flags on the worktree would block edits, but it breaks legitimate flows: review sends the task back, the reviewer reads and runs tools that write build output, the engineer resumes on the same worktree, git itself needs to write. It also needs reliable unlocking on every failure path. Detection at the moments that matter (pre-flight and publish) gives the same safety without that fragility.

## Acceptance
- [ ] Move to done on a task whose worktree is dirty (or HEAD moved since handoff) fails fast with the changed files listed, and does not start the gate.
- [ ] A change made mid-close-out aborts the publish before it reaches main and leaves the task in review with the reason.
- [ ] Locks are created on review and removed on send-back or done; a runner refuses to start in a locked worktree.
- [ ] Tests cover clean, dirty-at-enqueue, dirty-mid-job, and HEAD-moved cases.
- [ ] docs/close-out-pipeline.md documents the behavior, incl. the #0594 incident.

## Also update the instructions
- AGENTS.md already has the interim rule (interactive sessions must not edit a worktree in review/closing out). When locks ship, extend it to say check .repoos/locks/<id>.json.
- Mirror the rule in the AGENTS.md template string in src/commands/init.ts (Interactive agents section, ~line 213) so managed repos get it. Deliberate change: that ships to every repoos init.

## Activity

- 2026-09-30T05:01:28Z · created · unknown
- 2026-09-30T05:05:15Z · body
- 2026-09-30T05:55:43Z · cli_override, model_override
- 2026-09-30T05:55:44Z · model_override
- 2026-09-30T05:55:49Z · review_model_override
- 2026-09-30T05:55:49Z · status inbox→ready
- 2026-09-30T05:55:50Z · status ready→active, branch
- 2026-09-30T06:13:03Z · status active→review
- 2026-09-30T06:16:12Z · status review→active
- 2026-09-30T06:30:21Z · status active→review
- 2026-09-30T06:45:21Z · needs_input
- 2026-09-30T06:46:03Z · review_cli_override, review_model_override
- 2026-09-30T06:46:04Z · review_model_override
