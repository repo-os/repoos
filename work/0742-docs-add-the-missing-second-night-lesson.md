---
id: "0742"
title: "Docs: add the missing second-night lessons to docs/agent-run-operations.md (loop guard, validate.sh rollout and arg order, hung/killed runs, unreachable hosts, previews)"
type: chore
status: inbox
priority: p3
area: docs
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-07T17:40:53Z"
updated_at: "2026-10-07T17:40:53Z"
---
## Problem

docs/agent-run-operations.md (from #0710) covers the first night. A keyword check on 2026-10-08 found these second-night topics missing or not findable: the loop guard and the empty commit; the host /opt/repoos/validate.sh rollout and the argument-position bug; hung and killed validation runs; unreachable hosts; serve-noauth and leftover task previews. (Other topics are already covered: the 240 s local cap, worktree config, bookkeeping, fresh sessions.)

## Desired UX

Add short entries to docs/agent-run-operations.md (symptom, how to recognise it, cause, what to do, the task that fixed or tracks it). VERIFY each against current main and the existing doc first; skip anything already there or now fixed. Keep incident context separate from current operating rules, and do not repeat unproven claims.

1. **Loop guard.** A re-review of an unchanged branch tip after a known identical failure is refused (#0693); a new commit (even an empty one) changes the tip.
2. **validate.sh rollout and arguments (#0717 / #0725, hotfix 0ae3dd82b).** Hosts carry a root-owned /opt/repoos/validate.sh. The server's ssh call is validate.sh <bundle> <sha> <artifacts> [changed-ref] [mirror-path]; with a mirror path but no changed ref, $4 must be an empty placeholder or the mirror path lands in $4 and the script clones a ref-only bundle ('cloned an empty repository', exit 128 within seconds). Updating the host script is still needed for the incremental path; #0725 added compatibility for old scripts.
3. **Hung and killed runs (#0729, #0739).** A validation container can hang with the host idle; the detector kills it and retries elsewhere. A run whose gate already printed an exit status is a finished failure, not a hang. A kill is bounded and releases the slot. A stale 'HUNG . KILLING' entry in the Remote runners tab that predates the fix clears on a server restart.
4. **Unreachable host.** If a runner host drops off the network mid-run (ssh times out), host load is unknown so the idle test never passes and the detector cannot see it; cancel the close-out (POST /api/tasks/<id>/done/cancel or the stop button) and retry, and check the host.
5. **Previews and serve-noauth.** A task preview (or serve-noauth) rooted in a task worktree runs a second server that commits other tasks' bookkeeping onto that branch, which makes handoff fail with 'HEAD moved'. Stop previews with POST /api/tasks/<id>/preview/stop; never run serve-noauth from a task worktree.

## Acceptance criteria

- The five entries (or the verified subset) are in the doc, linked from docs/README.md if the doc is not yet; no contradiction with AGENTS.md. repoos check passes.

## Notes for AI

Docs only. Related: #0710 (done), #0739, #0729, #0725.

## Activity

- 2026-10-07T17:40:53Z · created · unknown
