---
id: "0520"
title: Run the pre-review gate on the remote validation runner
type: feature
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/run-the-pre-review-gate-on-the-remote-va
created_at: "2026-09-26T11:49:00Z"
updated_at: "2026-09-27T01:45:47Z"
review_passes: 6
review_rounds: 2
---
## Problem

The remote validation runner (`docs/remote-validation.md`) is used only by the
MTD close-out (`validateCandidate` in `src/server/integration-orchestrator.ts`).
The pre-review gate — the `repoos check` an engineer agent must get green before
its handoff — still runs the full test suite locally.

On a loaded dev machine that step hits its 300s timeout and the agent never
hands off. **#0509 and #0511 (2026-09-26)** both stalled this way: the work was
committed and correct, `repoos check` timed out on `tests`, and #0509 sat
`active` with `needs_input: dev-error` until the check was re-run by hand and
passed in 135s on a quiet machine. The same gate passes in ~120–135s on the
`mini` tailscale host for every recent close-out (#0507, #0510, #0511, #0513,
#0514, #0517).

## Changes

1. Add a remote path for the pre-review gate: when `[remoteValidation]` is
   enabled, run install + build + tests on the runner against the task
   worktree's HEAD (git bundle, same transport as close-out), then run the
   local guards with `REPOOS_SKIP_TESTS=1`, exactly as `validateCandidate` does.
2. Make it reachable both from the engineer agent's handoff verification and
   from `repoos check` (opt-in flag or setting), without changing default
   behaviour for repos with remote validation off.
3. Decide and document the unreachable-runner policy for pre-review: fail as
   retryable (current MTD behaviour, `fallbackToLocal = false`) or fall back to
   local. Add the Settings UI control per the AGENTS.md rule for user-facing
   `repoos.toml` keys.
4. Keep the remote log viewable per task (`.repoos/logs/remote-validation/`).

## Acceptance

- Test: pre-review gate calls `remoteValidator.validate` with the worktree
  path and HEAD sha when enabled, and skips local tests afterwards.
- Test: red remote gate is a non-retryable failure; unreachable runner follows
  the documented policy.
- Test: with remote validation disabled, `repoos check` behaves as before.
- `docs/remote-validation.md` updated: the "What runs where" table and hook
  points now cover the pre-review path.

## Out of scope

Raising the `tests` step `timeoutMs` (deliberately deferred), and multiple
runner hosts (separate task).

## Activity

- 2026-09-26T11:49:00Z · created · unknown
- 2026-09-26T11:55:17Z · status inbox→ready
- 2026-09-26T12:11:26Z · status ready→active, branch
- 2026-09-26T12:19:23Z · status active→review
- 2026-09-26T12:20:35Z · status review→active
- 2026-09-26T12:24:26Z · status active→review
- 2026-09-26T12:32:04Z · watchdog: auto-retried dead reviewer session · the reviewer agent produced no report and its session ended — starting a fresh review
- 2026-09-26T12:36:17Z · status review→active
- 2026-09-26T12:41:07Z · status active→review
- 2026-09-27T01:11:33Z · status review→active
- 2026-09-27T01:11:33Z · note: Merged main (#0512); remote gate tests committed tree, dirty CLI check runs locally, dispose awaited, remote failures recorded; check green with worktree CLI
- 2026-09-27T01:11:39Z · status active→review
- 2026-09-27T01:11:39Z · status review→active
- 2026-09-27T01:13:26Z · status active→review
- 2026-09-27T01:20:38Z · needs_input
- 2026-09-27T01:23:45Z · status review→active
- 2026-09-27T01:23:45Z · note: Recorded CLI remote failures; corrected hook-points docs (+release); check green
- 2026-09-27T01:23:51Z · status active→review
- 2026-09-27T01:23:52Z · status review→active
- 2026-09-27T01:25:38Z · status active→review
- 2026-09-27T01:26:43Z · needs_input
- 2026-09-27T01:26:43Z · needs_input
- 2026-09-27T01:30:34Z · status review→active
- 2026-09-27T01:30:34Z · note: Record CLI remote failures on all exit paths (+subprocess test); check green
- 2026-09-27T01:30:41Z · status active→review
- 2026-09-27T01:30:41Z · status review→active
- 2026-09-27T01:32:23Z · status active→review
- 2026-09-27T01:37:17Z · needs_input
- 2026-09-27T01:37:17Z · needs_input
- 2026-09-27T01:40:34Z · status review→active
- 2026-09-27T01:40:34Z · note: Runner never deletes an adopted VM (+test); check green
- 2026-09-27T01:40:40Z · status active→review
- 2026-09-27T01:40:40Z · status review→active
- 2026-09-27T01:42:24Z · status active→review
- 2026-09-27T01:45:47Z · needs_input
