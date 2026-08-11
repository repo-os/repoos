---
id: "0097"
title: Generate cached task context packs and bootstrap worktrees before launching agents
type: feature
status: active
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/generate-cached-task-context-packs-and-b
created_at: "2026-08-11T15:19:05Z"
updated_at: "2026-08-11T15:23:50Z"
---
## Problem

Every engineer turn begins by rediscovering the same repository structure,
commands, conventions, and relevant implementation files. RepoOS currently
launches the agent with a task path and a generic completion checklist, leaving
the model to perform many serial read/search round trips before it can edit.
Remote model latency turns a dozen cheap lookups into several minutes.

Resumed dirty worktrees are worse: after a server restart or lost session, the
new turn sees partial changes without the previous agent's understanding and
must reconstruct intent from scratch. Task 0089 demonstrated this directly. It
spent roughly its first four minutes rereading the task and codebase before
reporting that it understood the existing untracked `markdown.ts` and
`markdown.test.ts` work.

Worktree setup also leaks into model time. Fresh worktrees may lack
`node_modules`, contain a stale compiled RepoOS CLI, or fail an initial check for
environmental rather than code reasons. Agents discover and repair these
predictable conditions with tokens and tool calls even though RepoOS can do so
deterministically before spawning them.

This cost repeats for every task and every lost/resumed session. Adding more
unfocused context is not the answer: large prompts increase latency and bury the
files that matter. RepoOS needs a small, task-specific, cached context product
and a trusted preflight/bootstrap phase.

## Desired UX

When work starts or resumes, RepoOS prepares the registered worktree and builds
a concise context pack before invoking the configured agent. The first agent
message already knows:

- the task specification and applicable operating constraints;
- the current branch/worktree state and any partial changes;
- the most likely implementation files and why they are relevant;
- nearby tests and existing patterns to reuse;
- the correct build, test, check, and managed-preview workflow;
- whether the current baseline is known green and which setup has already been
  completed by RepoOS.

The pack is driver-neutral, visible/inspectable, bounded in size, and cached
against authoritative repository state. Straightforward scoped tasks should
normally reach their first meaningful source edit within 60–90 seconds instead
of spending several minutes on repeated orientation.

## Acceptance criteria

- [ ] Add a RepoOS-owned bootstrap phase before initial and resumed engineer
      turns; do not make the agent install dependencies or repair predictable
      worktree setup itself.
- [ ] Bootstrap validates the registered root/worktree/branch, makes required
      development dependencies available using a safe reproducible strategy,
      and ensures the RepoOS CLI/build used for orchestration is trustworthy.
- [ ] Bootstrap never rewrites source, task content, lockfiles, or unrelated
      user changes. Failures stop the launch with a clear actionable error and
      remain recoverable on the same worktree.
- [ ] Generate a deterministic task context pack containing the task spec,
      applicable AGENTS constraints, branch/worktree status, summarized dirty
      diff/untracked files, likely implementation files, relevant tests and
      patterns, verification commands, and managed-preview instructions.
- [ ] File relevance uses repository evidence (task paths/symbols, area,
      references, imports, tests, and recent related changes) rather than an
      unbounded dump of the repository or an extra mandatory LLM call.
- [ ] Context packs are path-guarded, driver-neutral, human-inspectable, and
      capped by an explicit byte/token budget with relevance-ranked truncation.
- [ ] Cache stable repository maps separately from task/worktree-specific data.
      Invalidate the correct layer when HEAD, task content, AGENTS/docs/config,
      dependency manifests, or the worktree diff changes.
- [ ] Initial and resumed turns receive the same context-pack format. A resume
      after lost session state explicitly describes existing partial changes so
      the new agent does not rediscover them blindly.
- [ ] Record orientation telemetry: launch requested, bootstrap duration,
      context generation/cache hit, agent spawned, and first meaningful source
      mutation. Surface it in the retained transcript for diagnosis.
- [ ] Add a repeatable benchmark of at least five representative straightforward
      UI/server/core tasks. With a warm repository-map cache, median
      spawn-to-first-source-edit is at most 90 seconds and at least four of five
      runs are at most 120 seconds on a supported agent/model combination.
- [ ] Deterministic warm-cache context generation, excluding dependency network
      installation, completes within two seconds for this repository.
- [ ] The benchmark verifies correctness signals too: agents select the expected
      file area and do not gain speed by skipping task/AGENTS constraints.
- [ ] Automated tests cover fresh and dirty worktrees, cache hits/invalidation,
      bounded context, missing dependencies, bootstrap failure, initial launch,
      and lost-session resume.
- [ ] `repoos check` passes.

## Notes for AI

- Agent launch/mission construction is in `src/server/agents.ts`; worktree
  creation and Git state helpers are under `src/core/git.ts` and the task-start
  route in `src/server/server.ts`.
- Prefer a dedicated context/bootstrap module with pure, testable ranking and
  cache-key functions rather than growing the mission builder indefinitely.
- Use `rg`, imports, task metadata, and existing index data for deterministic
  relevance. An optional model-enriched layer may be added later, but launch
  must remain fast and functional without it.
- Cache derived data under the configured `.repoos` cache directory, never in
  tracked source. Cache data must be safe to delete and rebuild.
- A previously green baseline can be cached only against all inputs that affect
  it. Do not claim a dirty resumed worktree is green merely because main passed.
- Avoid symlinking mutable dependency state when it could let one worktree
  corrupt another. Reuse package-manager caches/content stores safely and make
  the chosen strategy explicit.
- Do not persist hidden model reasoning or transfer one task's conversational
  history into another. The reusable artifact is verified repository context,
  not chain of thought.
- Follow ADR-0005: RepoOS performs privileged setup; agents consume the result
  and edit only their assigned workspace.

## Related

- 0041 — agent worktrees
- 0090 — durable agent sessions across reloads
- 0094 — RepoOS-owned worktree handoff finalization
- 0096 — RepoOS-owned managed previews
- ADR-0005 — agents use RepoOS APIs for privileged operations

## Activity

- 2026-08-11T15:19:05Z · created · unknown
- 2026-08-11T15:20:17Z · status inbox→ready
- 2026-08-11T15:23:50Z · status ready→active, branch
