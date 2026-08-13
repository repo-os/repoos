---
id: "0112"
title: "Supervise active agents with periodic health checks, safe recovery, and heartbeat reports"
type: feature
status: review
priority: p1
area: server
assigned_to: AI
created_by: ""
branch: feat/supervise-active-agents-with-periodic-he
created_at: "2026-08-12T04:00:13Z"
updated_at: "2026-08-13T16:26:01Z"
---
## Problem

RepoOS can launch several task agents concurrently and now exposes activity, resource, and orphan signals, but nobody continuously reconciles task state with the real processes and worktrees. Agents can exit while a task remains active, hang on permissions or provider failures, become orphaned after a server reload, consume resources without making progress, or remain silent for hours. The human must notice each failure, inspect several screens and logs, and decide whether to clean up, resume, restart, change a model, or wait.

Silence alone is not proof of failure: a model may be reasoning, tests may be running, output may be buffered, the machine may be under memory pressure, or the task may be waiting for the human. A watchdog that blindly restarts quiet agents could duplicate work, lose useful sessions, increase cost, or damage a dirty worktree.

## Desired UX

Add a server-owned Agent Supervisor that wakes on a configurable cadence, every 5 minutes by default, reconciles every active task against RepoOS runner state, persisted ownership/session data, worktree progress, process health and resource pressure, and publishes a compact heartbeat to the Control page. A normal report might say: 3 active; 2 healthy; 1 quiet but making filesystem progress; no action required. Attention reports explain the evidence, diagnosis, action taken or recommended, and when the next check will occur.

Use deterministic checks for facts and safe routine recovery. Invoke a configured diagnostic AI only for ambiguous cases, with bounded redacted context and a structured recommendation. The AI never receives arbitrary execution authority: the server validates recommendations against a narrow action allowlist and the configured recovery policy.

## Recovery policy

Introduce a supervisor configuration with at least enabled, interval, mode, quiet/stall thresholds, maximum automatic restarts, cooldown/backoff, and optional fallback agent/model. Modes are observe, the safe default, and recover. Observe diagnoses and warns but does not restart, kill, or switch models. Recover may perform only the explicitly allowed and bounded actions below. The UI explains the difference and records the active policy in every report.

No recovery may discard or reset worktree changes. No action may be based on silence alone.

## Acceptance criteria

- [ ] A single server-owned supervisor loop starts and stops with repoos serve, runs immediately after a short startup reconciliation and then every configured interval, defaults to 5 minutes, prevents overlapping cycles, and uses jitter or locking so reloads cannot create duplicate recovery attempts.
- [ ] Supervisor configuration is validated and documented: enabled, interval, observe/recover mode, quiet and confirmed-stall thresholds, maximum restarts per task/turn, exponential cooldown, diagnostic-agent choice, and optional ordered fallback agent/model combinations. Unsafe or malformed values fail soft to conservative defaults.
- [ ] Each cycle evaluates every active task using existing signals where available: runner/process liveness, PID ownership and start identity, last output, process CPU/memory, session/turn state and exit result, needs-input/needs-merge flags, worktree existence and dirtiness, recent file changes/commits, local command or test activity, resource pressure, and transcript tail. Missing signals are reported as unknown, not treated as failure.
- [ ] Classify tasks into explicit states such as healthy, quiet-but-alive, progressing-without-output, waiting-for-human, blocked-on-merge, resource-constrained, exited-unexpectedly, confirmed-stalled, orphaned, inconsistent, and unknown. Classification rules are deterministic, testable, and include the evidence and timestamps that produced the state.
- [ ] Quiet output alone never triggers an automatic restart. Confirmed-stall recovery requires corroborating evidence across multiple cycles or a definite process exit/failure, and respects configured minimum age, cooldown and attempt limits.
- [ ] Apply explicit research budgets to exploratory tasks: configurable elapsed-time,
  tool-call, and diagnostic-AI-spend ceilings, plus an early evidence checkpoint
  (for example, a documented command/API found within a bounded investigation).
  Exhaustion pauses the task and records a human decision request rather than
  allowing open-ended investigation.
- [ ] Detect low-progress loops independently of process liveness: repeated or
  near-duplicate commands, repeated permission denials, no source/test/doc
  changes across configured checkpoints, and attempts to use disallowed
  techniques. Report the evidence and suppress further automatic retries until
  the human chooses to continue, redirect, or stop.
- [ ] Treat unsupported integration research as a first-class terminal outcome.
  When no documented interface is found within the budget, the supervisor
  recommends preserving a safe fallback and documenting the limitation; it must
  not encourage binary scraping, hidden RPCs, or broader permissions merely to
  continue the investigation.
- [ ] Deterministic recovery can safely reconcile stale runner records, stop a positively identified RepoOS-owned orphan, and resume or restart a failed task in the same existing worktree/session context. Verify PID, process start identity, executable, task ownership and worktree before signaling a process so PID reuse or an unrelated human process cannot be killed. Ambiguous ownership produces a warning only.
- [ ] Dirty worktrees are preserved exactly. Restart/resume uses the existing RepoOS API/service and context-pack bootstrap; it never deletes, resets, recreates, or overwrites a worktree merely because the agent stalled.
- [ ] In recover mode, agent/model fallback is allowed only after a classified, repeated compatibility/provider/context failure that the fallback plausibly addresses, only from an explicitly configured fallback list, and only within a bounded attempt budget. Authentication, permission, merge and local resource failures must not be disguised by switching models.
- [ ] In observe mode, restart, cleanup and fallback suggestions require an explicit human action from the task or Control UI. In recover mode, every automatic mutation is still visible, reversible where possible, and recorded with before/after agent/model and reason.
- [ ] Waiting-for-human and needs-merge tasks are never restarted in a loop. The supervisor raises a durable attention item with a direct link and recommended human action, then suppresses duplicate noise until evidence changes or a reminder interval elapses.
- [ ] Resource pressure is part of diagnosis. The supervisor distinguishes local CPU/memory saturation from remote-model silence and does not punish a healthy agent merely because the host is overloaded. Initial scope may warn and defer new recovery attempts rather than automatically pausing unrelated healthy tasks.
- [ ] Ambiguous cases may invoke a configured diagnostic AI with a bounded, redacted snapshot containing metadata, recent events, safe transcript tail and worktree summary. Calls are rate-limited, cached by evidence fingerprint, and skipped when deterministic classification is sufficient. Diagnostic failure never blocks the cycle.
- [ ] The diagnostic AI returns a validated structured recommendation from an allowlist such as wait, warn-human, resume-same-session, restart-same-agent, try-configured-fallback, stop-owned-orphan, or no-action, plus confidence and evidence. It cannot submit shell commands, edit files, choose arbitrary models, expand permissions, mark review/done, merge, or delete worktrees.
- [ ] Server code, not the AI, rechecks all preconditions immediately before executing an allowed action. Stale recommendations are discarded when task, process, session or worktree evidence has changed.
- [ ] Persist a bounded supervisor event/audit log under the RepoOS cache directory so heartbeats and actions survive UI reloads and server restarts without dirtying git or task markdown. Writes are atomic, versioned, size/age bounded and fail soft on corruption.
- [ ] Expose a narrow read API for current supervisor status and recent reports, plus SSE events for new cycles/actions. Include cycle id, started/completed timestamps, next check, policy mode, summary counts, per-task diagnosis, evidence freshness, recommendation/action and result. Never expose secrets, full environments or unbounded transcript output.
- [ ] Add a Control-page Agent Supervisor card with last/next heartbeat, policy mode, active-task health counts and a chronological feed. Healthy cycles remain compact; warnings and actions are visually prominent and link to the affected task Agent tab.
- [ ] Provide Run check now and safe human recovery controls, protected against double submission. Configuration and recovery failures appear in the UI rather than disappearing into server logs.
- [ ] Heartbeats are useful but not noisy: do not append routine cycle messages to every task transcript or task activity log. Only material state changes and actions create durable per-task attention, while the Control page retains the full bounded supervisor feed.
- [ ] On server startup, reconcile persisted sessions/ownership records with live processes before attempting recovery. A process that survived reload is never assumed adopted merely because a transcript exists.
- [ ] Add fake-clock/fake-process/fake-agent tests covering healthy silence, real file progress without output, definite exit, permission wait, needs-input, merge block, resource pressure, positively owned and ambiguous orphans, PID reuse, dirty worktree preservation, restart backoff, attempt exhaustion, fallback eligibility, stale AI advice, duplicate-cycle prevention, reload reconciliation, redaction and audit retention.
- [ ] Add server API/SSE and Control-page tests; rebuild UI assets, refresh relevant screenshots, and pass repoos check.

## Notes for AI

Build on rather than replace #0080 agent activity telemetry, #0087 lifecycle cleanup, #0090 persisted transcripts/process-ownership constraints, #0091 system resource/orphan reporting, #0097 context packs and #0104 live task-state events. Extract a focused supervisor module instead of expanding the already large server.ts route body. Use existing RepoOS mutation/service paths rather than editing task files directly. Add no runtime dependency.

This task authorizes a bounded supervisor and recovery policy, not general autonomous administration. It must never move a task to review or done, merge branches, resolve conflicts, approve permissions, delete worktrees, reset changes, or kill a process whose RepoOS ownership is uncertain. The initial release should prefer a correct warning over an aggressive recovery.

## Related

- #0080 — activity, usage and evidence-based quiet warning
- #0087 — cleanup when tasks leave active
- #0090 — persisted transcripts and process-ownership boundary
- #0091 — resource panel and orphan detection
- #0094 — API-first trusted handoff for privileged operations
- #0097 — cached context packs and resume bootstrap
- #0104 — live propagation of needs-input and needs-merge
- #0111 — evidence-based agent/model recommendations

## Activity

- 2026-08-12T04:01:21Z · body
- 2026-08-12T08:15:49Z · added bounded research and low-progress loop safeguards
- 2026-08-13T13:06:41Z · status ready→active, branch
- 2026-08-13T13:18:32Z · watchdog: automatic resume attempted
- 2026-08-13T13:24:19Z · watchdog: escalated to needs_input · handoff signal was not detected after the automatic resume · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-13T13:28:50Z · needs_input
- 2026-08-13T16:25:59Z · status active→review
