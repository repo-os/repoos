# Dogfooding vs. general: which of our problems are real?

Written 2026-08-15. RepoOS is developed by running RepoOS on RepoOS. That is
deliberate ([ADR 0003](adr/0003-self-hosting.md)) and it works — but it distorts
the bug backlog. A large share of the pain in the task pipeline is **self-hosting
tax**: problems that exist only because the tool is orchestrating work on its own
source. Fixing those is maintenance, not product.

The purpose of this doc is to make that distinction explicit, so we stop paying
general-purpose engineering effort for self-inflicted problems, and so we know
which hard-won lessons actually transfer to a customer repo.

**Nothing here says dogfooding is a mistake.** It surfaced the most important
design constraints we have (see "Bucket 2"). It just cannot be read as a
representative bug list.

## The three buckets

Every issue in the task pipeline falls into one of three buckets. Sort a new one
before you spend a day on it.

### Bucket 1 — Self-hosting tax (mostly vanishes in another repo)

The control plane is the thing being edited. Agents rebuild the server that is
orchestrating them, so a source change restarts the orchestrator mid-flight.

- Reload churn (`src/server/reload.ts`, the "reload-churn interaction" section of
  [close-out-pipeline.md](close-out-pipeline.md)), the `.repoos/serve.lock` trap,
  and [#0214](../work/0214-let-a-server-restart-adopt-in-flight-age.md)
  (restart adopting in-flight agent turns). In a customer repo, RepoOS is an
  installed dependency that does not change while work is in flight.
- [#0216](../work/0216-orphaned-serve-processes-starve-the-clos.md) — orphaned
  `repoos serve` processes starving the close-out gate. This is a closed loop:
  the software under test *is* a server-spawning orchestrator, so its own test
  fixtures spawn the servers that then starve its own gate. Elsewhere the gate is
  `pytest` or `go test`.
- [#0213](../work/0213-dedupe-the-close-out-pipeline-s-build-an.md),
  [#0200](../work/0200-re-enable-the-disabled-headless-ui-smoke.md) — duplicate
  builds, WebKit smoke tests. Entirely about this repo's own gate.
- Committed `dist/`. See the worked example below.

### Bucket 2 — General design problems that dogfooding surfaced early

These would hit any repo. Dogfooding found them first, which is the whole point.

- **The handoff trust boundary**
  ([#0210](../work/0210-close-the-direct-patch-bypass-around-han.md)). An agent
  claimed `review` with 263 uncommitted lines. The transferable rule: *task status
  must be derived from observable repo state, never from an agent's self-report,
  and every path into `review` goes through one chokepoint.* This is the single
  most important thing self-hosting has taught us.
- **Liveness vs. staleness**
  ([#0203](../work/0203-bug-watchdog-false-positives-on-live-age.md)).
  Distinguishing "thinking hard" from "died silently" is unsolved in general and
  has zero repo-specific content. Corollary: when in doubt, preserve work
  (`review`), never dump to `ready`.
- **Integration serialization.** Main advancing mid-job, revalidate-on-drift, the
  repo lock. Inherent to N parallel agents on one trunk.
- **Gate false-negatives.** A flaky suite strands tasks in `review`. The fix —
  *distinguish an infrastructure failure from a genuine test failure, and retry
  before failing permanently* — is universal.
- **Failure-message fidelity**
  ([#0215](../work/0215-close-out-failure-ui-shows-merge-conflic.md),
  [#0199](../work/0199-move-to-done-is-flaky-agent-review-test-.md)). Reporting the
  actual reason instead of a generic one.
- **Task-file drift.** The task file exists on main and on the branch at once.
  That is the design, not the dogfooding.

### Bucket 3 — Amplified, but real

General problems whose *frequency* here is inflated. Fix them properly, but do
not size the work by how often they bite us:

| Problem | Here | Elsewhere |
|---|---|---|
| Restarts during agent runs | Every code change | Rare, but must still be correct |
| Generated-file merge conflicts | `dist/`, every merge | Lockfiles, snapshots, migrations — occasional |
| Machine contention | Fixtures spawn servers | Heavy suites, containers, port collisions |

## Worked example: committed `dist/`

A clean case of Bucket 1 that was masquerading as a general merge problem.

**Symptom.** Merge conflicts on essentially every close-out, which forced the
`autoResolve` list in `mergeBranch()`, the dirty-main guard
([#0204](../work/0204-show-dirty-main-files-on-move-to-done-an.md)) and its bug
([#0211](../work/0211-dirty-main-guard-did-not-fire-on-move-to.md)), plus
`chore: regenerate dist` commits polluting history and every agent's diff context.

**Measured cost.** 503 of 2039 commits (24.7%) touched `dist/`. 144 tracked
files, 2.0 MB of generated output.

**Actual root cause — one field.** Every other artifact is deterministic: `tsc`
output is stable, Vite asset filenames are content hashes, and `dist/ui/sw.js`
derives its cache tag from those hashes. Only `dist/.build-info.json` carried
`generatedAt: new Date().toISOString()`, so *every* build dirtied the tree even
when nothing changed.

**Fix applied (2026-08-15).** Split the timestamp into a gitignored
`dist/.build-stamp.json`; `dist/.build-info.json` keeps `{ hash, version }` and is
now byte-identical across rebuilds of identical source. Readers go through
`readBuildStamp()` in [`src/core/build.ts`](../src/core/build.ts), which falls
back to a legacy inline `generatedAt` for installs built before the split.
Verified: two consecutive builds produce zero tree change.

**Still open.** `dist/` remains tracked. It is not needed for distribution —
`files: ["dist"]` plus `prepublishOnly` means npm builds the tarball at publish
time — so gitignoring it is the real fix, gated on a tag-triggered release
workflow and on making the preview path build a fresh worktree on demand rather
than erroring with `no-build`.

**The lesson worth keeping.** Do not delete `autoResolve` or the dirty-main guard
when `dist/` goes away. Real repos have their own generated-file conflicts. Keep
the mechanism; stop manufacturing the trigger.

## What self-hosting structurally cannot surface

This is the part that should worry us most: these are not in the backlog *because
dogfooding cannot produce them*, so we have no signal at all.

- **Worktree bootstrap for non-JS ecosystems.** We symlink `node_modules` and
  call it done. Python venvs, Go module cache, Rust `target/`, `.env` files,
  docker-compose services, git submodules, Xcode DerivedData — none exercised.
  Likely the #1 source of "RepoOS doesn't work in my repo."
- **The gate command.** Ours is effectively `bun run build` + `repoos check`.
  Elsewhere it is arbitrary, user-configured, possibly 40 minutes long, possibly
  needs secrets or a live database.
- **Remote, PR, and CI close-out.** We merge locally to `main` with no remote, no
  PR, no CI, no branch protection, no reviewers. Most real repos require a pushed
  branch and a green PR. That is not a tweak to the close-out pipeline — it is a
  different terminal state machine (`publishing` becomes push → open PR → await
  CI → await approval) with network failure and CI latency we have never modelled.
- **Multi-developer concurrency.** One machine, one developer. No concurrent
  close-outs, no push races.

**Do not file these as tasks yet.** They are speculative until we run RepoOS on a
non-RepoOS project. Open that first, let it generate real failures, and file
tasks against what actually breaks rather than against this list.

## Triage heuristic

When something in the pipeline breaks, ask in order:

1. Would this still happen if RepoOS were an unchanging installed dependency? If
   no → Bucket 1. Fix it cheaply; do not generalize it.
2. Would this happen in a Python repo with a 20-minute CI gate and a protected
   `main`? If yes → Bucket 2. This is product work; design it properly.
3. If yes but rarely → Bucket 3. Fix properly, size by the general case.

And the standing question: *is this failing because of something we chose to do
to ourselves?* The `dist/` case says the answer is "yes" more often than it feels.
