# Agent debugging notes and incidents — full text

Worked examples and incident write-ups moved out of `AGENTS.md` on 2026-11-05
(size budget: `docs/agents-md-size.md`). The rules they motivate are summarised
in `AGENTS.md`; see also `docs/debugging-check-failures.md`.

## Debugging: search the error, then check the versions

When an error is *weird* — it makes no sense given the code, or the same code
behaves differently in two places — stop reasoning from first principles and do
two cheap things first:

1. **Search the exact error text on the web.** Someone has almost certainly hit
   it. This costs 30 seconds and routinely saves an hour of theorising.
2. **If anything smells like a dependency or environment problem, check the
   versions** — of the runtime, not just the packages. `node --version`,
   `bun --version`, and *which binary is actually running* (`process.execPath`,
   `which node`). "Works here, fails there" is a version difference until
   proven otherwise.

**Worked example (2026-08-15).** Task #0205's close-out failed the gate twice
with `TypeError: Cannot read properties of undefined (reading 'removeItem')` at
`src/ui-app/tests/repo-store.test.ts:805` — `localStorage` was undefined. The same suite
passed every time when run by hand. It was initially misdiagnosed as load-
induced flakiness (see `docs/dogfooding-vs-general.md`) and nearly written off
as contention noise from #0216, which would have been wrong.

A web search surfaced a known Vitest issue about Node's Web Storage API. Checking
versions closed it immediately:

- `bun run test` by hand → Node 24 → `localStorage` absent from `globalThis` →
  jsdom installs its own Storage → **passes**
- The close-out gate → `process.execPath` → the serving process's runtime,
  Homebrew Node 26 under launchd → Node defines `localStorage` as an accessor
  returning `undefined` (no `--localstorage-file`) → vitest's jsdom environment
  sees the key already present and skips installing jsdom's Storage → **fails**

100% deterministic, 668ms, on a completely idle machine. Not flaky at all. Fixed
with a setup shim (`src/ui-app/tests/setup/web-storage.ts`).

**Second worked example (2026-09-05).** `boot-timing.test.ts` (#0271) asserted
that `server.listen()` fires before the async index build finishes. A fix for
that test's HTTP-timing flake (comparing a network-polled timestamp against an
in-process one) checked out fine locally, then failed deterministically the
moment it ran through `bun run test` for real — not intermittently, every
single time. The cause wasn't the fix: `package.json`'s `"test"` script is
literally `node scripts/run-tests.mjs`, so a bare `bun run test` ran the whole
suite under **Node** unless the caller remembered `bun run --bun test` (what
`repoos check` uses internally, but nothing else did). Same command text, two
different runtimes. Under Bun — ~10x faster at spawning the git subprocesses
this fixture is full of — the async index build reliably finished before
`listen()` was even reached, flipping the exact invariant the test existed to
prove. Confirmed with a direct A/B on identical code: `bunx vitest run` 5/5
pass, `bun run --bun vitest run` 2/2 fail. Fixed by making
`scripts/run-tests.mjs` self-re-exec onto Bun whenever it's resolvable
(mirroring `reexecUnderBunIfRequested()` in `src/core/runtime.ts`), so
every invocation path now converges on one runtime — see `docs/architecture.md`.

**The sequel (#0330), and the general lesson underneath it.** Converging the
runtimes stopped the *symptom* but left the actual defect: the assertion was a
race, and which side won depended on how fast the box and the runtime were, so
the test measured the machine rather than RepoOS. The fix was to stop racing
rather than to keep the two runtimes honest — `startServer` now takes a
test-only `indexBuildGate`, awaited inside `LiveIndex.refreshAllAsync` after
the build finishes and immediately before its result is swapped in. A test can
hold the build at that point indefinitely, which makes "the listener bound
before the index was populated" a hard fact: the build provably got all the
way to the swap, the index provably has not been published, so if `listen()`
fired at all, it did not wait. **When a test's verdict flips with runtime
speed, the fix is usually to remove the race, not to reconcile the
environments** — a passing-under-Node suite that is meant to hold under Bun is
one machine-fingerprint away from shipping the bug it was written to catch.

**The general lesson:** "it passes for me but fails in the pipeline" is a
version/environment difference far more often than it is flakiness. Reproduce
under the *exact* runtime the failing system uses before concluding anything —
here that meant `/opt/homebrew/bin/node`, not whatever `node` resolves to in
your shell. And be suspicious of any diagnosis that requires the failure to be
random when it reproduces identically twice.

### Is a `repoos check` failure a flake or a real bug?

**If it reproduces in isolation on an idle machine, it is a real bug.** Genuine
resource-pressure flakes do not reproduce on a quiet box. Two corollaries, each
of which has cost days here:

- **Run the whole suite, not just the first failing file** — one root cause
  routinely breaks several suites, and the first failure is rarely the most
  informative.
- **Distrust exact-count assertions against streamed agent output**
  (`lines.length === 3`, `toEqual([...])`). A change to what a driver emits per
  turn breaks these, and it presents as a *timeout*, not an assertion error —
  which is exactly why one such regression was misdiagnosed as a flake for days
  while it broke every check.

There IS a real memory-pressure flake (subprocess-heavy tests timing out when
the machine is swapping), so this is a judgement call, not a dismissal. The
full triage order, the incidents behind it, and the remote-validation fix are
in `docs/debugging-check-failures.md` — read that before spending an afternoon
on a check failure you can't explain.

# Git setup

## Git setup: don't let a failed command skip branch creation

A past agent ran `git pull --ff-only && git checkout -b <branch>`. The pull
failed (no remote tracking branch), and `&&` short-circuited, so the branch was
never created and all work landed on `main`. Lessons:

- Do NOT chain git SETUP commands with `&&` such that one failure silently skips
  branch creation. Create the branch as its own step and confirm it succeeded.
- Do NOT `git pull` when branching from local `main` — there may be no tracking
  branch, and you don't need it. Branch from local: `git checkout main` then
  `git checkout -b <branch>`.
- Before your FIRST commit, verify you are on the intended branch
  (`git branch --show-current`). For normal task work, do not commit on `main`.
  An explicitly requested direct-to-main hotfix is the exception; confirm that
  authorization and stage only its intended files.
- Managed task worktree creation is RepoOS's job — use the Start action and
  do not hand-roll a second worktree for a task.

### Edit the task worktree, not the checkout your tools start in

A harness's file/edit tools and shell resolve relative paths against the
session's working directory — and for a task session that is usually still the
**main checkout**, even after RepoOS has demonstrably created and handed back
the task's worktree. Relative-path edits then land on `main` while the task
branch sits untouched, with no error. Two separate harnesses made this exact
mistake on 2026-10-01.

- Before your FIRST edit — not just your first commit — confirm where it will
  land: run `pwd` for shell work, and prefer the worktree's **absolute path**
  for every file/edit tool whose own working directory you don't control. A
  `cd` is not enough when the tool's root is fixed at the session's start.

When a task's engineer session runs on a remote runner (ADR
[0009](docs/adr/0009-remote-engineer-sessions.md)), the same rule has a remote
form: the real worktree is on that host under the path the task context names,
and the laptop's copy is a *fetched mirror*, not the working tree. Do not edit
the laptop copy to "fix" something the agent saw remotely — those edits are not
where the agent is working, are not committed by the remote turn, and are
discarded or flagged when the branch tip is fetched back. Run shell work through
the runner (the task context gives the host and worktree), and remember that
`repoos check`/handoff read the fetched local branch: a remote commit only
counts once RepoOS has fetched it back. If the fetch-back reports a diverged
local tree, stop and surface it — never reset or force-push around it.

## Stuck-active incident (#0151): worktree missing its own task file

A task can get permanently stuck `active`, failing finalization with
`task file is missing from the registered worktree`, retry included. Root
cause (confirmed via git history, not guessed): task creation writes the file
to disk and commits it to `main` (`docs(<id>): add task`), but that commit can
silently fail (`commitTaskFile` is fail-soft) while the file is still visible
everywhere else — API, UI, `repoos list`. If `/start` runs before a retried
commit lands, `ensureWorktree` cuts the branch from a `main` HEAD that doesn't
have the file yet. Once that worktree/branch exists, plain reuse never
re-checks freshness, so every future start/resume hands back the same
file-less worktree forever — a stuck task cannot self-recover.

Fixed in `ensureWorktree` (`src/core/git.ts`): whichever worktree it resolves
(new or reused) is now healed if the task's own file is missing from it — copy
main's current version in and commit it on the worktree's branch, narrowly
scoped to that one file so in-progress work is never touched. This should mean
you never see this failure mode again; if you do, that's a bug in the heal
itself, not something to work around by hand. **Do not "fix" a stuck task by
manually copying the file into the worktree** — that papers over the same
symptom without checking whether the healing logic ran or why it didn't; file
it as a bug against `ensureWorktree` instead, and use `git ls-tree
<worktree-branch> -- work/<file>.md` to confirm the file is genuinely absent
from history (not just stale) before concluding it's the same issue.

Related, softer version of the same gap: because `patchTaskFile` (status
transitions, e.g. `ready`→`active`) commits only to `main`, a worktree's own
copy of its task file can legitimately lag main's frontmatter (stale
`status`/`branch`/`updated_at`) even when the file itself is present — this is
expected, not a bug, and does not block review/done.

