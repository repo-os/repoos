---
status: accepted
date: 2026-10-20
deciders: nick
---

# 0008 — Recover coding-agent failures with centralized pair remaps

## Status

Accepted.

## Context

RepoOS configuration can pin a coding-agent CLI and model in several places.
When a provider runs out of credit, a model is withdrawn, or a CLI stops
working, a user needs to know which saved choices are affected and recover
without hunting through every settings surface and task.

The configured choices and related controls are distinct:

| Surface | What it configures | Where it is stored |
| --- | --- | --- |
| Agents page roles and custom agents | CLI/model for engineer, reviewer, PM, CTO, Ross, and custom roles | `agents` in `repoos.toml` |
| Task-level engineer, reviewer, and PM overrides | Optional agent name, CLI, and model pins; unset values inherit the role | Task frontmatter in `work/*.md` |
| Built-in agents | CLI/model for individual on-demand or scheduled agents, such as Debugger and Tech Debt | Built-in-agent state under the configured RepoOS cache directory |
| Adaptive model routing | Candidate choices and actual per-run decisions for PM, engineer, and reviewer | Candidates derive from configured agents and the budget allowlist; decisions are recorded per run |
| Budget allowlist | Agent/model pairs an agent driver may select, with optional pair pauses | `[[budget.allowlist]]` in `repoos.toml`; this is policy, not an assignment |

There are also one-shot choices supplied for an individual PM/story or
authoring request. They are not durable assignments and should not be reported
as saved uses. The Agents page's model test and detected-agent lists describe
availability, not where a pair is assigned.

Existing controls solve narrower problems:

- The optional budget allowlist pause skips a paused pair when resolving role
  defaults. It does not provide a complete inventory and an explicit human
  task override is intentionally honored even when its pair is paused. It is
  therefore not a reliable "stop using this everywhere" control.
- Adaptive model routing can make a bounded, eligible selection for
  unpinned PM, engineer, and reviewer runs. Explicit pins remain pins. Its
  review handback can switch or escalate under its own policy, including
  same-harness constraints for resumable sessions. It is not a general response
  to a provider-wide outage or an unavailable pinned model.
- The stalled-agent supervisor addresses task health and restart behavior; it
  does not inventory or replace every configured CLI/model pair.

A global fallback applied whenever a run "fails" is ambiguous: a non-zero exit
can mean an unavailable provider, bad credentials, a broken CLI, a task-specific
problem, or an agent-produced error. Retrying on another pair can spend more,
hide the root cause, change the task's capability or permissions, and break
session continuity when the CLI changes. A single default also misses explicit
task and built-in-agent choices.

## Decision

Add a centralized **Agents → Recovery** experience based on a durable,
pair-scoped recovery remap. Do not add an implicit global fallback that retries
any failed agent run.

The inventory groups configured uses by coding-agent CLI and model and shows
both the saved selection and its effective selection. Each group shows its use
locations: role/custom-agent name, built-in-agent name, and task id plus role
for persisted engineer, reviewer, and PM overrides. A `default` model remains
an explicit CLI-default selection; do not pretend it names a specific model
unless the run reports one. The inventory distinguishes durable assignments
from recent actual routing decisions and does not count one-shot request
selections as saved uses.

From a source pair, a user can select a working destination CLI/model and
choose **Replace every use**. Before saving, show the exact source and target
pairs, affected roles and built-in agents, and a count/list of affected task
overrides. Applying the action creates one central remap rule; it does not
rewrite `repoos.toml`, built-in-agent state, or task frontmatter. The inventory
then shows each saved choice alongside the effective remapped pair. The user
can remove the rule to restore the saved choices, or change its destination.

The rule matches the exact source CLI/model pair, including the literal
`default` selection. A separate CLI-wide action may match every model on one
CLI when the CLI itself is unavailable. Destinations must be a different,
currently selectable pair; reject self-maps and mapping chains/cycles. A
remap is scoped to the current RepoOS root, not to every unrelated project on
the same account.

Apply remaps in the shared effective-agent resolution path before launch so
role defaults, explicit task pins, and built-in-agent runs cannot bypass a
recovery rule. A matching remap takes precedence over that saved choice and
over automatic model routing for that run; the router must not select the
quarantined source pair. The destination is treated as the deliberate human
selection, not as a reason to make another automatic retry. Keep existing
budget/availability checks visible and fail with an actionable error if the
destination is no longer usable; do not silently fall back or chain remaps.

Remaps affect future launches and follow-up turns only. They do not interrupt
or mutate a currently running process. A future turn using a different CLI
must start a fresh agent session rather than pass the old CLI's session id to
the new harness; preserve the task worktree and task history. Record the
source, destination, affected run/task, and rule change in activity/audit
history so a user can understand which pair actually ran and why.

The Agents page must provide the inventory, preview, apply, edit, and remove
controls; this is not a raw-TOML-only feature. Persist remaps in repository
configuration and expose them through the existing config/API path. A recovery
action is an explicit operational policy change, with a clear confirmation
before it changes all matching uses.

## Alternatives considered

### Rewrite every affected saved assignment

This is explicit, but bulk edits span `repoos.toml`, built-in-agent state, and
many `work/*.md` files. It creates a large mutation surface, can race task
updates, obscures the original selection, and makes rollback difficult.
Central remaps provide the same broad replacement while preserving original
preferences and making recovery reversible.

### One global fallback pair on any failure

Rejected as the default recovery mechanism. It cannot cover all configured
uses consistently if it only applies to inherited role defaults, and applying
it to explicit pins would silently override deliberate choices. Failure
classification is not reliable enough to distinguish account/provider
unavailability from task or harness errors, and cross-CLI retry can lose
session continuity or change permissions and cost. Existing adaptive routing
remains the bounded, opt-in mechanism for its supported routing and handback
cases; it is not broadened into generic failure retry by this decision.

### Use only the budget allowlist pause

Insufficient: the allowlist is optional and intended to constrain agent
drivers, not serve as the authoritative inventory or a universal override of
human-pinned task settings.

## Consequences

- A user can find all persistent uses of a failing pair and replace them in one
  explicit, reversible action.
- The saved configuration remains intact, so removing a temporary remap
  restores the prior assignment.
- Failure handling stays observable and bounded; a failed replacement returns
  a useful error rather than starting an unbounded fallback chain.
- Implementation must centralize effective pair resolution and inventory
  reads across repo config, built-in-agent state, and task files. The inventory
  must distinguish configured, remapped, routed, and actually launched pairs.
- Tests must cover exact-pair and CLI-wide matching, all persisted assignment
  surfaces, precedence over explicit pins and routing, malformed/cyclic rules,
  removal/restore, unavailable destinations, and unaffected active sessions.

## Related

- [Agents](/agents) — current assignment, testing, budget controls, and model
  routing surfaces.
- [Configuration](/configuration) — `budget.allowlist` and
  `[model_routing]`.
- ADR-0005 — RepoOS owns validated mutations across agent/workspace boundaries.
- Task #0767 — Define centralized coding agent recovery.
