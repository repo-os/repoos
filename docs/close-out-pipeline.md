# Close-out pipeline: how to move a task from `review` to `done` correctly and safely

Written 2026-08-14 after a multi-hour session recovering the close-out pipeline from a
silent, 100%-failure state (task #0118's pipeline had never completed a single job
successfully since it shipped). This doc exists so the next agent (or human) does not
have to re-derive any of this from scratch. Follow it literally — the state machine and
recovery steps below are exact, not illustrative.

**If you are an agent reading this because a task won't move to `done`: read this whole
doc before touching anything. Do not guess. Do not kill processes ad hoc. Do not hand-edit
task frontmatter to force a status change — that bypasses the Activity log, `updated_at`,
and git history, and desyncs the task file from its branch copy (this exact mistake caused
a real, confirmed merge-conflict failure later in this session — see "Task file drift"
below).**

## The two state machines

There are two separate, nested state machines. Confusing them is the #1 cause of
misdiagnosis.

**1. Task status** (`work/<id>-*.md` frontmatter `status:`):
`inbox → ready → active → review → done`

**2. Close-out job phase** (in-memory + `.repoos/jobs/`, one job per task moving through
`review → done`): `queued → syncing → validating → publishing → cleanup → done`, or
`failed` at any point.

A task sitting in `review` with `needsMerge: false` and no job is just waiting for a
human (or `POST /api/tasks/:id/done`) to start the SECOND state machine. A task stuck in
`review` with a `failed` job is stuck in the second state machine — the fix is almost
always in the job, not the task.

## How to check current job state

```bash
curl -s http://localhost:7171/api/tasks/<id>/integration-job
curl -s http://localhost:7171/api/integration-jobs   # every job in the queue
```

Fields that matter: `phase`, `reason` (only present when `failed`), `baseMainSha`,
`branchSha`, `candidateSha`.

## The five phases, what each one does, and what "stuck" looks like

### 1. `queued` → `syncing`
Creates (or resets) a **candidate worktree** at `repoos-worktrees/repoos/integrate/<id>`
on branch `repoos/integrate/<id>`, hard-reset to current `main`. Symlinks
`node_modules` from the main checkout (candidate worktrees never get their own install —
if this symlink is missing, every build in the next phase fails with module-not-found
errors that look unrelated).

**Known-fixed bug (commit `d66c7877`):** the candidate branch prefix was
`.repoos/integrate/` — a leading dot is not a valid git refname, so *every* job failed
here, silently, for the pipeline's entire lifetime until 2026-08-14. If you ever see
`could not create candidate worktree`, check the prefix constant in
`integration-orchestrator.ts` hasn't regressed back to a dot-prefixed value.

### 2. `syncing` → `validating`
Merges the task's feature branch into the candidate worktree.

**Known-fixed bug (commit `e34485c7`):** this merge used to have zero conflict
auto-resolution. `dist/.build-info.json` used to carry a unique hash+timestamp on
*every* independent build, so it conflicted on essentially every single merge — this
alone failed nearly every job. The task's own doc file also routinely conflicts (status/
review_rounds bookkeeping differs between the branch's copy and main's copy). Both are
now auto-resolved via `mergeBranch()`'s `autoResolve` list (`dist/`, `screenshots/`, the
task's own file — same mechanism the legacy `done.ts` path already used).

**Root cause removed (2026-08-15):** the timestamp moved out of the tracked marker into
a gitignored `dist/.build-stamp.json`, so `dist/.build-info.json` is now
`{ hash, version }` and a rebuild of unchanged source produces a byte-identical tree.
`dist/` conflicts should now be RARE (only when the branch and main genuinely built
different source), not universal. **Keep `autoResolve` anyway** — it is the general
mechanism for generated-file conflicts, and every repo has some. If you see `dist/`
conflicting on every job again, determinism has regressed: check that
`scripts/copy-assets.mjs` has not put a timestamp back into the marker.

**If you see `merge conflict in <path>` for anything OTHER than `dist/`, `screenshots/`,
or the task's own `work/<id>-*.md`: that is a REAL source conflict.** Do not force-resolve
it blindly — it means the task's branch and main both changed the same file. Resolve it
properly in the feature branch's own worktree (merge main into the feature branch, fix
the conflict there, let the branch re-validate), not in the candidate.

### 3. `validating` (build + check)
Runs `bun run build` then `repoos check` in the candidate worktree. Both must succeed.

**Known-fixed bug (commit `3fbbd707`):** the check step called a globally-linked `repoos`
CLI (or `bun run repoos check`, which runs from *source*, not the freshly-built `dist/`).
Either can silently validate against the WRONG code — a global install's build-freshness
and gate logic can disagree with the checkout actually being validated (same failure
class as #0130 in the legacy path). Now it runs the candidate's own
`dist/cli/index.js` first. **If `repoos check` fails here but passes when you `cd` into
the candidate worktree and run it manually, that first-choice CLI selection has
regressed — check `integration-orchestrator.ts`'s `validateCandidate()` still prefers
`join(wtPath, "dist", "cli", "index.js")` before any fallback.**

**Diagnosing a `check failed: ...` reason:** the reason string is only the LAST
non-empty line of combined stdout+stderr (fixed in the same commit — it used to be the
FIRST line, which for the `bun run` fallback path is a useless shell preamble like
`$ bun src/cli/index.ts check`). If the reason is still unhelpful, don't guess — go
reproduce it directly:
```bash
cd repoos-worktrees/repoos/integrate/<id>
node dist/cli/index.js check
```
This is the exact command the orchestrator runs. If it passes here but the job still
reports `failed`, the job likely got interrupted mid-flight by a server reload (see
"The reload-churn interaction" below) — retry `POST /api/tasks/<id>/done` rather than
debugging the candidate further.

### 4. `validating` → `publishing` → `cleanup` → `done`
Acquires a repo lock, re-checks main hasn't drifted since `syncing` started (if it has,
the job goes back to `syncing` automatically — this is correct self-healing, not a bug),
fast-forward-or-merges the candidate into live `main`, then removes the candidate
worktree/branch and the task's own feature worktree/branch, and marks the task `done`.

If a job fails here (rare — validation already passed), main was NOT touched; the repo
lock guarantees that. Safe to just retry.

## The reload-churn interaction (NOT YET FIXED — read this before troubleshooting flakiness)

Every `validating` phase's `bun run build` rewrites `dist/` on the **candidate**
worktree, which is harmless. (Since 2026-08-15 a rebuild of unchanged source rewrites
the marker with identical content, so a no-op rebuild no longer trips the auto-reload
hash watcher at all — one input to the churn below is gone, but the interaction
itself is not fixed.) But if a job is running close together with
other repo activity (another agent's build landing on `main`, or you running `bun run
build`/`repoos check` on `main` directly), the MAIN server process's own auto-reload
(`src/server/reload.ts`) may attempt a handoff at the same time. As of 2026-08-14 this
handoff frequently fails (`reload: replacement failed to become ready`), and the old
process re-binds and keeps serving — no data loss, but the server is briefly
unresponsive (curl connection-refused for a few seconds), and any in-flight job's
in-memory state can be disrupted.

**What to do when you hit this:**
- A `POST /api/tasks/:id/done` (or any API call) that returns nothing / times out: wait
  a few seconds and retry. Do not assume the server is down for good — check
  `curl http://localhost:7171/api/health` first.
- If health genuinely fails for more than ~60-90 seconds: check
  `ps aux | grep "dist/cli/index.js serve"` and `lsof -i :7171`. If there is a live,
  listening process, it will very likely recover on its own (the watchdog described
  below also self-heals this on macOS after 3 consecutive failed health checks).
- **Never `kill -9` a repoos serve process without checking `.repoos/serve.lock` first**
  (see next section) — this is a documented trap, not a hypothetical.
- Do not run `bun run build` on `main` repeatedly in quick succession while a job is
  mid-`validating` — each one is an extra reload trigger stacked on top of the job's own.
- This interaction itself is not fixed. It is tracked for `#0185` (always-on service
  management). Do not attempt to fix `reload.ts`'s process-handoff model as a side quest
  while chasing a stuck task — that file's design has already been hardened through
  specific past incidents (`#0096`, `#0143`); read it in full first if you ever do touch it.

## The `.repoos/serve.lock` trap (confirmed live during this session)

`src/server/serve-reaper.ts` maintains a lockfile (`.repoos/serve.lock`) recording the
PID of the currently-serving process, specifically so a NEW `repoos serve` refuses to
silently coexist with a live one. It correctly detects a stale lock (dead PID) and
self-clears — **but only when a repoos-managed code path checks it**. If you manually
`kill -9` a serve process from outside repoos's own reap/reload logic, and something else
then tries to start a new server while the lock still points at that now-dead PID, you
can hit a race where the lock hasn't been observed-and-cleared yet, and the new instance
refuses to bind with `Port 7171 is already bound by another repoos serve process (PID
...)` — even though that PID is dead.

**If you see that exact error and you're sure the named PID is dead:**
```bash
cat .repoos/serve.lock   # confirm the PID it names
ps -p <that pid>         # confirm it's actually dead
rm .repoos/serve.lock    # only after confirming — never blind
launchctl kickstart -k gui/$(id -u)/com.repoos.serve   # macOS, if using the LaunchAgent
```
Prefer letting the existing reap logic handle it (it runs at boot and on conflict
detection) over manual intervention — only intervene if the server has been down for
more than ~2 minutes.

## Task file drift (confirmed live during this session)

The task's own `work/<id>-*.md` file exists in TWO places while a task is `active` or
`review`: the copy in `main`'s `work/` directory (canonical, what the UI/API read), and
the copy inside the task's own feature-branch worktree (what the agent edits and
commits). Repoos's own write paths (`patchTaskFile`, `commitTaskFile`, the auto-bounce
review logic in `review.ts`) keep these in sync as part of normal operation.

**If you hand-edit the main copy directly** (e.g. bumping `review_rounds` by hand,
patching frontmatter with a script, anything that writes the file without going through
repoos's own task-file API) **you will desync it from the branch's copy**, and the next
close-out attempt will hit a real merge conflict on that file — which used to hard-fail
the whole job before the `autoResolve` fix above, and even now just means "the branch's
version wins," silently discarding whatever you hand-edited on main. **Don't hand-edit
task frontmatter. Use the API** (`PATCH /api/tasks/:id`, the `message`/`review/message`
routes, or the CLI) **so the change is tracked, logged, and synced correctly.**

## Quick reference: symptom → cause → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| `could not create candidate worktree` | Candidate branch prefix regressed to a dot-prefix | Check `CANDIDATE_BRANCH_PREFIX` in `integration-orchestrator.ts` |
| `could not get main SHA` | Stale job from before the prefix fix, or genuinely broken git state | Retry `POST .../done` — jobs re-enqueue cleanly now (commit `d66c7877`) |
| `merge conflict in dist/...` or `merge conflict in work/<id>-*.md` | Should not happen post-`e34485c7` — if it does, `autoResolve` regressed | Check `validateCandidate()`'s `autoResolve` array still includes `dist/`, `screenshots/`, and the task's own path |
| `dist/` dirty on `main` after a plain `bun run build` | Build determinism regressed — a timestamp/random value is back in `dist/.build-info.json` | Check `scripts/copy-assets.mjs`: the marker holds `{ hash, version }` only; `generatedAt` belongs in the gitignored `dist/.build-stamp.json` |
| `merge conflict in <any other file>` | Real source conflict between the feature branch and main | Fix it in the feature branch's own worktree, not the candidate |
| `check failed: <unhelpful shell preamble>` | Should not happen post-`3fbbd707` — if it does, the tail-line diagnostic or local-CLI-first ordering regressed | Reproduce manually: `cd` into the candidate worktree, run `node dist/cli/index.js check` directly |
| `check failed: <real reason>`, and it reproduces manually in the candidate worktree | The task's actual code has a real bug | Fix it on the feature branch, not the candidate (the candidate is discarded and rebuilt from the branch every retry) |
| API call to `/done` or `/integration-job` returns nothing / times out | Reload churn (see above) | Check `/api/health`, wait, retry — don't assume corruption |
| `Port 7171 is already bound by another repoos serve process (PID N)` and PID N is dead | Stale `.repoos/serve.lock` after a manual kill | See "The `.repoos/serve.lock` trap" above |
| Job silently disappears / stays `validating` far longer than a normal check run (~2-3 min) | Server reload interrupted the job mid-flight | Retry `POST .../done` — the job will resync from a fresh candidate |

## Before you conclude something is "broken" — checklist

1. Is `main` itself green? `cd` to the main checkout, run `repoos check`. If this fails,
   that's a real, separate problem — stop and fix it before touching the close-out
   pipeline at all.
2. Does the task's OWN code pass check, in its own feature-branch worktree, run
   manually? If not, the bug is in the task's implementation, not the pipeline.
3. Does it pass in the CANDIDATE worktree (`repoos-worktrees/repoos/integrate/<id>`),
   run manually? If yes but the job still reports `failed`, the bug is in the
   orchestrator's invocation (wrong CLI, wrong cwd, swallowed output) — not in the code
   being validated.
4. Only after 1-3 are ruled out should you suspect the reload-churn interaction or a
   fresh, not-yet-seen bug in `integration-orchestrator.ts` itself.

Do not skip straight to "the pipeline is broken, let me rewrite it" — nearly every
failure this session traced back to one of a small number of specific, fixable causes
above, not a fundamentally broken design.
