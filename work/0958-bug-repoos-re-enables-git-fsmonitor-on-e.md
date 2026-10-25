---
id: "0958"
title: "Bug: RepoOS re-enables git fsmonitor on every server start (one daemon per worktree, load spikes); respect a human's false and add an off switch"
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bug-repoos-re-enables-git-fsmonitor-on-e
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-25T11:34:02Z"
updated_at: "2026-10-25T11:35:28Z"
---
## Problem

At every server start, `tuneRepoForScale(config.root)` (`src/core/git.ts`, called from `src/server/server.ts`) writes `core.fsmonitor = true` and `core.untrackedCache = true` into the repo's `.git/config`, and it re-writes them whenever the value is not exactly "true". Linked worktrees share that config, so a repo with 25 task worktrees runs about 25 `git fsmonitor--daemon` processes (31 counted), each registering FSEvents watches on a tree that includes `node_modules`. On Nick's Mac this drove `fseventsd` to 100%+ CPU and over 1 GB of memory, machine load into the hundreds, and server freezes. A human who sets `core.fsmonitor=false` to stop it has the setting silently reverted on the next server start (every managed project runs its own RepoOS server: repoos, divot, lightingai, pn, squishy).

## Desired behavior

1. `tuneRepoForScale` never overrides a value a human set: if the key is already set to anything (true or false), leave it. Only set the keys when they are unset.
2. Provide an explicit off switch: a `repoos.toml` setting (for example `git.tuneForScale = false`) with a Settings UI control and copy that explains the tradeoff, honored by the server start path. Default decision to document in the notes: leave the default on only if the daemon count is bounded; consider defaulting off on macOS, or enabling fsmonitor only for the main checkout and not task worktrees.
3. Bound the cost when it is on: do not leave one daemon running per finished task worktree; stop the daemon (`git fsmonitor--daemon stop`) when a worktree is removed or its task is done, and at close-out cleanup.
4. `repoos doctor` warns when more than a threshold of fsmonitor daemons run (for example more than 8), names the cost, and shows the one-line fix.

## Acceptance criteria

- [ ] Test: a repo with `core.fsmonitor=false` is left false after `tuneRepoForScale`; an unset repo gets true only if the setting allows it.
- [ ] The new setting appears in `getConfigSchema()` and the Settings UI with a test, and is documented in `user-docs/configuration.md`.
- [ ] Worktree removal/cleanup stops that worktree's fsmonitor daemon (test with a fake git runner).
- [ ] `repoos doctor` reports the daemon count and warns above the threshold (test).
- [ ] Docs: note the fsmonitor cost and the Nick incident (2026-10-25) in `docs/` where appropriate.
- [ ] Run tests touching git.ts and server start in small groups, then `repoos check --changed main`.

## Notes for AI

- Do not start a second RepoOS server from a worktree (bug #0954).
- Nick has already set core.fsmonitor=false and core.untrackedCache=false by hand in repoos, divot, lightingai, pn and squishy; the fix must not undo that.

## Activity

- 2026-10-25T11:34:02Z · created · njachowski@gmail.com
- 2026-10-25T11:35:12Z · status inbox→ready
- 2026-10-25T11:35:27Z · cli_override, model_override
- 2026-10-25T11:35:28Z · status ready→active, branch
