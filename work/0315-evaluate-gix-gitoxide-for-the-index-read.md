---
id: "0315"
title: Evaluate gix/gitoxide for the index read hot paths
type: feature
status: inbox
priority: p4
area: general
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-28T09:55:22Z"
updated_at: "2026-08-28T10:11:18Z"
---
`gix` (gitoxide, Rust) is faster than shelling `git` for read-only ops. Candidate
for the index hot paths only: log, status, branch/worktree/ref enumeration in
core/git.ts + the indexer. Keep shelling `git` for mutations (worktree add,
merge, commit).

## Approach: optional, not default (keeps zero-dep)

Mirror the Bun runtime pattern (REPOOS_RUNTIME): zero-dep by default, opt-in for
those who want it. `resolveGix()` like `resolveBun()` — if a gitoxide backend is
available (PATH binary or a native module), route the ~5 read ops through it;
else shell `git` exactly as today. The onboarding/setup flow offers to install
it ("speed up git operations on large repos? [y/N]").

Two forms:
- **gix CLI binary** (`cargo install gitoxide` or prebuilt download) — simplest,
  but the CLI surface is less stable than git's and its output needs separate
  parsing. Only captures the "gix does the git op faster" win.
- **napi-rs native module** (downloaded per-platform on opt-in) — more setup,
  but ZERO per-call process-spawn cost, which is the bigger win at repoos scale
  (see estimates). Stable library API.

## Estimated speedup (measure to confirm)

After the #1/#6 batching + #2 fsmonitor + Bun work, an index build (warm cache)
is ~700ms, roughly: ~365ms for 4 meta git spawns, ~175ms lastCommitsForDir (1
log pass over ~3600 commits), ~85ms branchAheadCounts, rest file parse.

Where gix helps and by how much:
- **Process-spawn overhead** (~5-15ms per `git` call): a long-lived gitoxide
  library has zero. ~6-10 calls per index build → ~50-100ms saved. Compounds
  hard on `refreshBranches` (fires every task mutation) and per-worktree sweeps.
- **`git log` full-history pass**: gitoxide's commit-graph traversal ~2-4x
  faster → 175ms → ~50-80ms here; much bigger on a deep-history monorepo.
- **`git status` per worktree**: fsmonitor (#2) already got this to ~20ms warm;
  gix maybe ~5-10ms. Marginal now.
- **ref enumeration**: ~85ms → ~10-20ms.

Net for repoos-on-repoos today: index build ~700ms → ~350-450ms (~1.5-2x),
`refreshBranches` sync part ~370ms → ~100ms. Noticeable, not transformative.

## Does it depend on repo size?

- **Worktree count**: mostly no after batching + the persisted status cache
  (usually 0-3 worktrees need re-checking per build).
- **File count (working tree size)**: YES for `git status` — a 100k+ file tree
  is slow even with fsmonitor cold; gitoxide status scales better. Not a factor
  for repoos (~800 tracked files).
- **History depth**: YES for the log pass — repoos ~3600 commits = 175ms; a
  100k-commit monorepo makes `git log` slow while gitoxide's commit-graph stays
  fast. **This is where gix earns its keep — repoos managing a big external
  monorepo, not repoos-on-repoos.**
- **Ref count**: minor (~50 branches here; thousands would matter).

## Recommendation

Cheap to de-risk first: install the `gix` CLI, write a throwaway benchmark
comparing gix vs git for the 5 hot ops on (a) this repo and (b) a large
monorepo. ~1 day for real numbers. Then decide CLI-shell-out vs napi module vs
"not worth it".

Only pursue if Phase 0 usage data + real use shows index/CLI latency is still a
felt problem after everything else landed. Part of the 2026-08 perf initiative
(#5). Lower priority than #0314.

## Activity

- 2026-08-28T10:11:18Z · body
