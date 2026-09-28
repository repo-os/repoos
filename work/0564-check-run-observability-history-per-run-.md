---
id: "0564"
title: "Check run observability: history, per-run metadata, and live runner dashboard"
type: feature
status: inbox
priority: p3
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T03:44:07Z"
updated_at: "2026-09-28T03:44:07Z"
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

Add a "Remote runners" tab to the Checks page showing each configured host (local host too, if meaningful) with:
- Health / reachability (probed: yes/no, healthy: yes/no, failure detail)
- Current in-flight run(s): task ID + elapsed time (not just a count)
- Queue depth and next-up task
- Last completed run: task ID, pass/fail, duration, when

This requires tracking `activeRuns: { taskId, startedAt }[]` per host in `TailscaleHostPool` and surfacing it through `RemoteHostStatus` and the `/api/remote-validation/status` endpoint.

### 3. Per-task check status (contextual)

On the task page, when a task's pre-review or close-out check is in progress, show a chip or status line: "Checks running on bee · 2m 34s". When done, show the result inline rather than only in the Debug tab.

## Scope

- Backend: a `check_runs` table (or log file per run) recording the metadata above; written by the pre-review gate (`runRemotePreReviewGate`), close-out orchestrator (`validateCandidate`), and standalone `repoos check`
- `TailscaleHostPool`: add `activeRuns` tracking per host; update `RemoteHostStatus`
- Checks page: new "Runs" history tab + new "Remote runners" live tab (alongside existing "Plan" / "Test suite")
- Task page: surface current check status and which machine during active runs
- Settings remote validation drawer: keep as-is (or fold into the new Checks tab if redundant)

## Out of scope

Resource metrics (CPU/memory on remote hosts), autoscaling, Hetzner runner pooling.

## Activity

- 2026-09-28T03:44:07Z · created · unknown
