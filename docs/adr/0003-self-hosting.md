---
status: accepted
date: 2026-05-29
deciders: nick
---

# 0003 — Self-host RepoOS on RepoOS

## Status

Accepted.

## Context

RepoOS is a tool for managing repo-native tasks and orchestrating AI agents
against a codebase. Its own source lives in a monorepo — which is itself a
codebase with tasks, a roadmap, bugs, and agent work to coordinate.

We need a way to manage RepoOS's own development. The options:

- Use a conventional external tracker (Linear/GitHub Issues) for RepoOS's
  roadmap, keeping the tool's own process separate from the tool.
- Use RepoOS to manage RepoOS — "self-hosting" / dogfooding — so the roadmap
  lives as `work/*.md` files in this repo, managed by the very system being
  built.

The forces at play: RepoOS's central claim is that repo-native tasks are
superior for AI-native workflows. The fastest, most honest test of that claim
is to live inside it. Self-hosting also collapses the feedback loop between a
design decision and the regret of that decision — friction surfaces in minutes,
not months. The cost is a class of bootstrap hazards that only exist when a
tool operates on its own source.

## Decision

RepoOS manages its own development. The roadmap lives in `work/*.md` in this
repo. We dogfood the tool on itself.

The local development loop uses `bun link`, which symlinks the global `ros`
command at this repo's `dist/`. Source edits therefore do not affect the
running `ros` until `bun run build` regenerates `dist/`.

## Consequences

Positive:

- The tool's core claim is continuously tested by its own authors.
- The roadmap is legible to agents as repo-native task files — an agent can
  pick up work from `work/` without external context.
- `docs/` and AGENTS.md get exercised as real agent-context surfaces, not
  hypothetical ones.

Costs we accept:

- **Stale-build hazard.** Because `ros` runs compiled `dist/`, not source,
  editing `src/` without rebuilding means testing old code. This is the single
  most common time-waster in this repo. Mitigation: stated as a first-read rule
  in AGENTS.md; `tsc --watch` during focused sessions.
- **Committed build output.** `dist/` is tracked, so every close-out merges
  generated files. Until 2026-08-15 the build marker carried a timestamp, which
  dirtied the tree on every build and conflicted on essentially every merge —
  the trigger behind the `autoResolve` list and the dirty-main guard. The build
  is now deterministic (timestamp split into a gitignored
  `dist/.build-stamp.json`), which removes the churn but not the underlying
  choice to track `dist/`. Gitignoring it entirely is the real fix and is
  gated on a tag-triggered release workflow; see
  `docs/dogfooding-vs-general.md`.
- **A distorted bug backlog.** Self-hosting generates failure modes that exist
  only because the tool is orchestrating work on its own source, and it cannot
  surface the ones a customer repo would hit first (non-JS worktree bootstrap,
  arbitrary gate commands, PR/CI close-out). Sort issues into those buckets
  before spending on them — `docs/dogfooding-vs-general.md` is the triage
  guide.
- **Self-modification hazard.** Changing the task-file format or parser alters
  how this repo's own `work/*.md` files are read — including the task being
  worked on. Mitigation: format changes ship with a migration in the same
  change and are verified against all existing `work/` files; format-sensitive
  tasks carry a warning in their `Notes for AI`.
- **Template-vs-this-repo confusion.** The AGENTS.md *template* that `ros init`
  scaffolds into other repos lives in `src/commands/init.ts`; it is not this
  repo's own AGENTS.md. Editing the template ships to every future `ros init`.
  These two "AGENTS.md contents" are easy to conflate. Mitigation: noted
  explicitly in AGENTS.md Conventions.
- **Circular-dependency trap.** `bun add repoos` in this repo is circular and
  breaks installs. Mitigation: stated rule; the package lists only dev deps.

## Migration discipline

When a change alters the task-file format or frontmatter schema:

1. Write the parser change and a migration together, in the same change.
2. Bump a `repoos_version` marker so an older `ros` can refuse a too-new repo
   with a clear error rather than silently misreading it.
3. Verify the parser reads every existing file in this repo's `work/` before
   considering the change done.

## Related

- Operational rules derived from this decision: see the "This repo is
  self-hosted" section of `/AGENTS.md`.
- Supersedes nothing. If self-hosting is ever abandoned, write a new ADR that
  supersedes this one rather than editing it.
