---
id: "0573"
title: Add configurable close-out (MTD) pipeline timeout
type: feature
status: inbox
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-09-28T08:39:50Z"
updated_at: "2026-09-28T12:06:15Z"
---
## Problem

Move-to-done (MTD) runs the close-out job (`queued → syncing → validating → publishing → cleanup`) with **no wall-clock budget on the job as a whole**. Individual subprocesses have their own caps (e.g. `runProcess` build 5m, local `repoos check` child 10m in `integration-orchestrator.ts`), and `[[check.steps]].timeoutMs` defaults to 10m per step — but the orchestrator can still spend unbounded time across phases, **including a full validating retry** (#0216), main-drift resyncs, and remote validation.

Remote validation is the sharp edge: `runRemotePreReviewGate` for close-out does **not** pass a `deadlineAt`, so a run can sit in the host pool queue or on a stuck SSH session indefinitely (`remote-host-pool.test.ts` documents that close-out/release intentionally pass no deadline today). Observed in the wild: a task stuck on the check step for **>23 minutes** with no terminal state and no actionable error.

Humans can **Stop MTD** (#0459), which cooperatively kills children and drops the job **without** a failure badge. That is not a substitute for an automatic ceiling — operators should not have to babysit hung close-outs.

## Goal

Add a **configurable pipeline timeout** so a hung or pathologically slow close-out **always** terminates, surfaces a clear timeout error, and leaves the task in **`review`** with a normal failed-job record (retryable), same as other transient gate failures.

## Configuration

- New `repoos.toml` section, e.g. `[closeOut]` with **`timeoutMs`** (number).
- **Default: `360000` (6 minutes)** when unset.
- Document semantics in `user-docs/configuration.md` and wire into **`getConfigSchema()`** + a Settings control (AGENTS.md rule: user-facing feature settings need UI).
- Suggested copy: total wall-clock budget for one close-out attempt from when the job leaves `queued` (set `startedAt`) until the job reaches `failed`, `done`, or is removed by user cancel.
- **`0` = disabled** (preserve today's unbounded behaviour for repos that need it). Invalid/negative values should fail config load or clamp with a clear error — pick one and test it.

## Behaviour (acceptance criteria)

1. **Clock start:** When the integration job transitions `queued → syncing` and `startedAt` is set (existing field), the pipeline deadline is `startedAt + timeoutMs` (or no deadline when `timeoutMs` is 0).

2. **Enforcement:** While a close-out is in flight, the orchestrator checks remaining time at the same checkpoints already used for **Stop MTD** (`isCancelled` polling in `runProcess`, between major phases in `processJob` / `validateCandidate`). When remaining time ≤ 0:
   - Kill any in-flight child (build, check, publish subprocess) the same way cancel does (SIGKILL).
   - Tear down the throwaway integrate candidate worktree.
   - Record the job as **`failed`** (not silent removal like user cancel) with a **stable, grep-friendly reason**, e.g. `close-out timed out after 6m — increase closeOut.timeoutMs or retry when the runner is less loaded`.
   - Task **stays `review`**; feature branch/worktree untouched; **Move to done** can be retried after fixing infra or raising the limit.

3. **Distinct from user cancel (#0459):** Timeout is a **failure** with the inline error card and integration job `reason`. User cancel keeps **no** failure badge. UI copy in `closeOutFailure.ts` (or equivalent) should classify timeout as **retryable validating/infra**, not merge conflict.

4. **Remote validation:** Pass the pipeline's **remaining** budget into `runRemotePreReviewGate` / the remote runner as `deadlineAt` so queue wait + remote work cannot ignore the cap (#0521 queue-deadline path already exists). Release path may share the same helper in a follow-up if scope is tight — call out in implementation notes.

5. **Retries:** The existing **single** orchestrator-level validating retry (#0216) and drift/resync loops **count toward the same** `startedAt` budget (do not reset the clock on retry). If 6m is too tight for remote-heavy repos, operators raise `timeoutMs`; do not add a second implicit retry for timeouts.

6. **Per-step timeouts:** When a pipeline deadline is active, child `runProcess` timeouts should be **`min(stepTimeout, remainingMs)`** so a step cannot outlive the pipeline (otherwise a 10m check step defeats a 6m pipeline default).

7. **Observability:** Log an integration event at timeout; optional: include elapsed time in the task's close-out progress UI if cheap (#0564 check history is separate — no requirement to block on it).

8. **Tests:** Unit/integration tests in existing orchestrator and remote-pool suites — at minimum: simulated slow phase aborts before wall clock; timeout reason recorded; cancel path unchanged; `timeoutMs: 0` disables; remote gate receives a deadline when configured.

9. **Docs:** Update `docs/close-out-pipeline.md` (troubleshooting: hung MTD vs timeout vs stop) and `user-docs/configuration.md` for the new key.

## Implementation pointers

- Primary code: `src/server/integration-orchestrator.ts` (`processJob`, `runProcess`, `validateCandidate`, `runRemotePreReviewGate` call ~1436), `src/core/config.ts` (`loadConfig`, `getConfigSchema`, `SUPPORTED_TOML_KEYS`), Settings tab that owns server/merge settings today.
- Reuse #0459 machinery (`isCancelled` polling, `removeCandidate`, `failOrReconcile`) rather than a parallel kill path.
- Do **not** change handoff pre-review timeouts in this task unless required for shared helpers — scope is **close-out/release** if release shares the orchestrator pattern.

## Out of scope

- Changing default per-step `check.steps.timeoutMs` (10m).
- Auto-scaling remote hosts or fixing root cause of slow checks.
- Extending #0564 history with timeout-specific fields (nice-to-have only).

## Open questions for implementer (resolve in task or PR, don't block on PM)

- Whether **publishing** + publication-lock wait should be included in the same budget (recommended: yes — it's still MTD).
- Exact Settings tab placement and whether to show a human-readable "6 min" preset alongside raw ms.

## Related

- #0459 Stop MTD (user-initiated abort, not a failure)
- #0521 remote host pool / queue deadlines
- #0564 check-run history (phase `close-out`)
- `docs/close-out-pipeline.md`, `docs/debugging-check-failures.md` (load vs hang)

## Activity

- 2026-09-28T08:39:50Z · created · unknown
- 2026-09-28T11:45:41Z · body
- 2026-09-28T12:06:15Z · model_override
