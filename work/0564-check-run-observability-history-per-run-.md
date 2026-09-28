---
id: "0564"
title: "Check run observability: history, per-run metadata, and live runner dashboard"
type: feature
status: review
needs_input: true
needs_input_reason: review-failed
needs_input_detail: the opencode agent timed out after 900s
priority: p3
area: core
assigned_to: ai
created_by: ""
branch: feat/check-run-observability-history-per-run-
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-09-28T03:44:07Z"
updated_at: "2026-09-28T10:02:53Z"
check_retry_count: 1
last_check_failure: "[object Object]"
review_passes: 2
review_rounds: 1
---
## Problem

Every time a check runs — local or remote — the outcome disappears after the fact. The user has no way to know how long a full vs partial run typically takes, which machine ran it, or whether a slow gate is structural or a one-off. The remote runner Settings drawer shows live host status but nothing historical, and nothing appears on the task page while checks are in progress.

## Goals

Three distinct views, all built on the same underlying run record:

### 1. Check run history (analytical)

Record every check run — local and remote, handoff and close-out — with:
- **machine**: hostname (or "local") and whether it was a remote tailscale host
- **duration**: wall-clock time from start to finish (or failure)
- **scope**: full suite vs `--changed <ref>` partial run, and which steps were skipped
- **outcome**: pass / fail / cancelled, and which step failed
- **caller**: task ID (or "cli" for standalone `repoos check`), and the phase (pre-review, close-out, release)

Surface this as a tab on the Checks page ("Runs" or "History") showing a sortable table of recent runs across all tasks. Useful for answering: "How long does a full suite take on bee vs mini?" and "Was the last MTD failure a fluke?"

### 2. Live runner status (operational)

Add a "Remote runners" tab to the Checks page showing each configured host with:
- Health / reachability (probed: yes/no, healthy: yes/no, failure detail)
- Current in-flight run(s): task ID + elapsed time (not just a count)
- Queue depth and next-up task
- Last completed run: task ID, pass/fail, duration, when

This requires tracking `activeRuns: { taskId, startedAt }[]` per host in `TailscaleHostPool` and surfacing it through `RemoteHostStatus` and the `/api/remote-validation/status` endpoint.

### 3. Per-task check status (contextual)

On the task page, when a task's pre-review or close-out check is in progress, show a chip or status line: "Checks running on bee · 2m 34s". When done, show the result inline rather than only in the Debug tab.

## Storage

A new `.repoos/checks.db` SQLite file — **separate from `repoos.db`** (the auth DB). `repoos.db` requires `REPOOS_SECRET_STORE_KEY` and is unavailable on machines without auth configured; check run history has no security requirement and should not inherit that dependency. Separate file = no locking contention, independently inspectable/deletable, always available.

Suggested schema:

```sql
CREATE TABLE check_runs (
  id          INTEGER PRIMARY KEY,
  task_id     TEXT,        -- null for bare CLI runs
  phase       TEXT,        -- 'pre-review' | 'close-out' | 'release' | 'cli'
  machine     TEXT,        -- hostname or 'local'
  remote      INTEGER,     -- 0 = local, 1 = remote tailscale host
  scope       TEXT,        -- 'full' | 'changed:<ref>'
  started_at  TEXT,        -- ISO-8601
  duration_ms INTEGER,     -- wall-clock, null if cancelled before completion
  outcome     TEXT,        -- 'pass' | 'fail' | 'cancelled'
  failed_step TEXT         -- null when passing
);
```

## Scope

- `src/core/check-store.ts` — new module; open/migrate `.repoos/checks.db`, write and query `check_runs`
- Pre-review gate (`runRemotePreReviewGate`), close-out orchestrator (`validateCandidate`), and standalone `repoos check` — each writes a row on completion
- `TailscaleHostPool` — add `activeRuns: { taskId, startedAt }[]` per host; update `RemoteHostStatus` and the status endpoint
- Checks page — new "Runs" history tab + new "Remote runners" live tab (alongside existing "Plan" / "Test suite")
- Task page — surface current check machine/elapsed during active runs; result inline when done
- Settings remote validation drawer — keep as-is or fold into the Checks tab if it becomes redundant

## Out of scope

Resource metrics (CPU/memory on remote hosts), autoscaling, Hetzner runner pooling.

## Activity

- 2026-09-28T03:44:07Z · created · unknown
- 2026-09-28T03:52:34Z · body
- 2026-09-28T03:56:41Z · cli_override, model_override
- 2026-09-28T03:56:46Z · model_override
- 2026-09-28T03:56:50Z · status inbox→ready
- 2026-09-28T03:56:53Z · status ready→active, branch
- 2026-09-28T05:02:25Z · status active→review
- 2026-09-28T05:08:24Z · status review→active
- 2026-09-28T05:36:14Z · status active→review
- 2026-09-28T06:30:47Z · status review→active
- 2026-09-28T09:22:09Z · status active→review
- 2026-09-28T09:22:52Z · handoff failed · remote validation failed: remote validation failed (exit 1) — [lock] slot 0 acquired after 0s
[validate] cloning bundle /Users/peckjachowski/.repoos-0564-5242433e.bundle
Note: switching to '6695d61895c04464e2f05da4e660fc1c5c96ca9c'.
You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.
If you want to create a new branch to retain commits you create, you may
do so (now or later) by using -c with the switch command. Example:
  git switch -c <new-branch-name>
Or undo this operation with:
  git switch -
Turn off this advice by setting config variable advice.detachedHead to false
[validate] HEAD verified at 6695d61895c04464e2f05da4e660fc1c5c96ca9c
bun install v1.4.2 (744846f84)
error: EACCES accessing temporary directory. Please set $BUN_TMPDIR or $BUN_INSTALL
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-09-28T09:44:06Z · needs_input
- 2026-09-28T10:02:51Z · review_cli_override, review_model_override
- 2026-09-28T10:02:53Z · review_model_override
