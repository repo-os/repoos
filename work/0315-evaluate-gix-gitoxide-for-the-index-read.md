---
id: "0315"
title: Evaluate gix/gitoxide for the index read hot paths
type: feature
status: inbox
priority: p4
area: general
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-28T09:55:22Z"
updated_at: "2026-08-28T09:55:22Z"
---
`gix` (gitoxide, Rust) is multiples faster than shelling `git` for status/log on a
large monorepo. Candidate for the read-only index hot paths only: log, status,
branch/worktree enumeration in core/git.ts + the indexer. Keep shelling `git` for
mutations (worktree add, merge, commit) where correctness matters most.

**The real decision, not just an optimization:** using gix from Node means either
- shipping prebuilt per-platform `gix`-based binaries in the npm tarball, or
- a napi-rs native module wrapping gitoxide.

Either way this is the FIRST non-JS artifact in the package and breaks the
"zero deps / just JS / `npm i -g repoos`" story that made the Bun runtime switch
so clean. Decide deliberately.

Cheaper alternative that keeps zero-dep: keep squeezing the shell-out patterns
(batch more calls — #1/#6 already did a lot, enable fsmonitor — #2 done).

Only pursue if, after Bun + the batching wins, index/CLI latency is still a
felt problem. Measure first (the sessions DB + the perf notes from the 2026-08
initiative have the current numbers).

Part of the 2026-08 perf initiative (#5). Lower priority than #0314.

## Activity

- 2026-08-28T09:55:22Z · created · unknown
