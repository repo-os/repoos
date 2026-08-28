---
id: "0314"
title: "Cheaper task worktrees: reflink/APFS-clone instead of git worktree add"
type: feature
status: inbox
priority: p3
area: general
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-28T09:55:04Z"
updated_at: "2026-08-28T09:55:04Z"
---
When many agents spin up at once, `git worktree add` per task checks out the tree
and contends on the main repo's index lock. On a copy-on-write filesystem a clone
is near-instant and cheap.

Ladder:
1. `clonefile` (macOS / APFS) — `cp -c`
2. `cp --reflink=auto` (Linux — btrfs, XFS with reflink=1; NOT ext4)
3. fall back to current `git worktree add` everywhere else (ext4, other FS)

Detect FS support once at startup; pick the fastest available per platform.

Fiddly bits:
- Can't naively clone an existing linked worktree — its `.git` is a file pointing
  at `<main>/.git/worktrees/<name>`, so a raw copy = two working trees sharing one
  gitdir entry. Clone the main checkout's tree then wire up worktree registration
  (or clone + `git worktree repair`).
- node_modules etc. are already symlinked by bootstrap.ts — keep that.

Payoff is concentrated: bursts of concurrent agent starts. Bundle the Bun.spawn
shim (`Bun.spawn` when `typeof Bun !== "undefined"`, ~1.2-1.5x on git-heavy ops)
into the same branch since it also touches core/git.ts.

Part of the 2026-08 perf initiative (#4). See git.ts `ensureWorktree`.

## Activity

- 2026-08-28T09:55:04Z · created · unknown
