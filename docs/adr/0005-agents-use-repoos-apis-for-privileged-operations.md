---
status: accepted
date: 2026-08-11
deciders: nick
---

# 0005 — Agents use RepoOS APIs for privileged operations

## Status

Accepted.

## Context

RepoOS runs coding agents in isolated task worktrees. Agents need broad freedom
to read and edit the source files assigned to them, but completing a workflow
can also require operations outside that workspace: writing the canonical task
copy, updating shared Git worktree metadata, committing or merging branches,
controlling child processes, or using credentials owned by RepoOS.

One response is to expand each agent driver's permissions until it can perform
the whole workflow directly. That couples RepoOS behavior to the sandbox model
of Codex, OpenCode, Gemini, and every future driver. It also turns orchestration
gaps into permanent security exceptions and gives probabilistic agent code
access to shared state that RepoOS can mutate more safely itself.

Task 0029 exposed the concrete failure mode: a Codex agent completed and tested
its implementation in a linked worktree, but `workspace-write` correctly
prevented it from writing the main repository's shared Git metadata and
canonical task file. The workflow treated this expected boundary as an agent
failure. Task 0089 separately showed why recoverability matters: an agent was
interrupted mid-turn and the server restart erased the in-memory explanation.

RepoOS already has guarded write paths and task-scoped HTTP actions. The trusted
RepoOS server knows the configured root, registered worktree, expected branch,
task state, and active agent session, so it is the right authority for
cross-boundary mutations.

## Decision

Agents EXPRESS INTENT; RepoOS performs PRIVILEGED OPERATIONS.

An agent edits and tests code inside its assigned workspace. When the workflow
requires a mutation outside that boundary, it requests a narrow RepoOS
operation through a typed API or structured runner protocol. RepoOS validates
the request against its own state, performs the operation, and records the
result for the UI and transcript.

This applies to operations including:

- canonical task and board-state updates;
- Git commits, refs, merges, worktree creation, and worktree removal;
- agent, preview, and other child-process lifecycle actions;
- repository-level configuration or secrets unavailable to the task sandbox;
- future external side effects owned by RepoOS.

Each privileged operation must be:

- **Narrow.** Model a specific domain action, never general shell execution or
  arbitrary filesystem access.
- **Scoped.** Bind it to the task, run/session, expected worktree, branch, and
  valid state transition where applicable.
- **Validated.** Resolve paths and repository state in the trusted process; do
  not accept agent-provided paths or commands without authoritative checks.
- **Idempotent or safely retryable.** Restarts, duplicate signals, and resumed
  turns must not duplicate commits or corrupt state.
- **Observable.** Persist progress and actionable failures so a reload cannot
  turn a known outcome into a mysteriously stuck task.
- **Driver-neutral.** Codex, OpenCode, Gemini, and future agents request the
  same RepoOS domain operation instead of receiving different permission hacks.

Direct source-file editing inside the assigned worktree remains the normal
agent interface. This decision does not turn every file edit into an API call.
It governs operations that cross the agent's task-workspace or trust boundary.

Expanding an agent's permissions is an exceptional fallback. It requires a
documented reason that a narrow RepoOS operation cannot reasonably provide the
capability, and the grant must be limited to the smallest path and duration.
Full-filesystem access and sandbox-bypass flags are not normal orchestration
tools.

## Consequences

Positive:

- Agent sandboxes stay meaningful and least-privileged.
- Workflow behavior is consistent across models and CLI drivers.
- RepoOS can enforce task state, worktree, Git, and review invariants in one
  deterministic place.
- Privileged operations become testable without relying on model behavior.
- Idempotent server-owned actions make interrupted and resumed workflows easier
  to recover and explain.
- Security review focuses on explicit API capabilities instead of accumulated
  command-line permission exceptions.

Costs we accept:

- RepoOS must implement and maintain domain operations that an unrestricted
  agent could otherwise perform with shell commands.
- The server/runner becomes responsible for durable operation state and clear
  failure recovery.
- New workflows may need an API addition before an agent can complete them end
  to end.
- API authorization and validation mistakes are security-sensitive, so route
  scope and tests are part of the feature rather than follow-up hardening.

## Design guidance

- Prefer an internal structured runner signal when the server already owns the
  agent process. Use HTTP only when a real external caller needs the operation.
- If an agent calls HTTP directly, use a short-lived task/run capability and a
  local-only transport; do not rely solely on the server being bound to
  loopback.
- Reuse core mutation functions behind CLI, UI, and agent-facing actions so the
  same guards and events apply everywhere.
- Never expose a general command-execution endpoint as a shortcut.
- Keep source editing file-native, consistent with ADR-0001 and ADR-0004. The
  API boundary begins where shared state, authority, or side effects begin.

## Related

- ADR-0001 — repository-native task files remain the source of truth.
- ADR-0004 — capability boundaries also serve as security boundaries.
- Task 0029 — linked-worktree Git and canonical-task permission failure.
- Task 0090 — durable agent transcripts across server reloads.
- Task 0094 — RepoOS-owned agent worktree handoff finalization.
