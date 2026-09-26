---
id: "0520"
title: Run the pre-review gate on the remote validation runner
type: feature
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-26T11:49:00Z"
updated_at: "2026-09-26T11:49:00Z"
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
