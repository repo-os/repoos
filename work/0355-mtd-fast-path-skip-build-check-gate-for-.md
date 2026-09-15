---
id: "0355"
title: "MTD fast path: skip build/check gate for docs-only candidates"
type: feature
status: ready
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T13:11:13Z"
updated_at: "2026-09-15T14:24:25Z"
---
## Problem

`validateCandidate` (`src/server/integration-orchestrator.ts`) always runs the
full expensive gate — `bun run build` (~line 826) then the candidate's own
`repoos check` (build+lockfile+fmt/lint+full build+tests+ui-smoke, ~lines
842-950) — even when a task's diff touches nothing but documentation. A
docs-only task (e.g. #0354's kind of output, or any `docs/`/`user-docs/`/
`*.md`-only change) pays the same 10-25 minute build+test+ui-smoke cost as a
change to `src/`, for zero additional safety: none of those steps can catch
anything about a markdown edit.

Discussed 2026-09-15: the fix is a narrow, literal fast path inside the MTD
gate, not a change to `repoos check` itself or to human review.

## Explicitly NOT in scope

- **Human review is unaffected.** The reviewer still reviews every task's
  diff before it reaches `review` → done, exactly as today. This task only
  changes what the automated close-out gate (`validateCandidate`) runs
  AFTER a human has already signed off and the task is being merged to
  main — it has nothing to do with whether a human looks at the change.
- **Do not weaken standalone `repoos check`.** Same constraint #0276 already
  established for a different reason: `repoos check` is the definition-of-
  done bar every task-runner agent self-verifies against before requesting
  review (AGENTS.md). This task touches ONLY the orchestrator's own
  `validateCandidate`, never `cmdCheck`'s semantics.
- **No fuzzy "mostly docs" heuristic.** The docs-only predicate must be a
  literal, mechanical check on the merged diff's file paths — ANY path
  outside the allowlist forces the full gate, no exceptions, no scoring, no
  "looks safe" judgment calls. Getting this wrong means a real code change
  slips past build/test/ui-smoke, which is the whole safety net MTD exists
  to provide.

## Where to make the change

In `validateCandidate` (`src/server/integration-orchestrator.ts`), after the
merge completes and BEFORE the "Full build" step (~line 826):

1. Compute the merged diff's changed file paths against `mainBranch`
   (`git diff --name-only <mainBranch> HEAD` in `wtPath`, or add a small
   helper alongside the existing `getDiff`/`getDiffStats`/`getDiffStatsAsync`
   in `src/core/git.ts:865-905` if a reusable one doesn't already fit —
   those two return counts, not paths, so this needs a small addition).
2. Classify as docs-only ONLY if every changed path matches: starts with
   `docs/` or `user-docs/`, ends with `.md`, OR is the task's own
   `work/<id>-*.md` file (already expected to change on every task; this is
   NOT the same as the `autoResolveOurs`/`resetForeignWorkFiles` handling
   for OTHER tasks' work files a few lines above — don't conflate them).
   `repoos.toml`, `package.json`, anything under `src/`, `scripts/`,
   `.github/`, etc. — ANYTHING else — disqualifies the fast path.
3. If docs-only: skip BOTH the "Full build" step (~line 826-833) and the
   entire "check" step (~line 842-950, which itself already runs
   staleness/lockfile/fmt/lint/build/tests/ui-smoke via the candidate's own
   `repoos check` — none of these can fail differently for a markdown-only
   diff than they would on main already). Go straight to capturing
   `candidateSha` (existing code after the check block, ~line 1005+).
   Otherwise, run the existing full path unchanged.
4. Log clearly in the job's transcript/logger (`this.logger?.integration`,
   same pattern used elsewhere in this file) that the docs-only fast path
   was taken and list the changed paths that justified it — a human
   debugging a later incident must be able to see WHY build/test/ui-smoke
   didn't run for this merge, not just that they didn't.
5. Everything else in `validateCandidate` stays unconditional: the merge
   itself, conflict-marker scanning (already runs on `.md` files too, see
   the `textExtensions` list ~line 772 — keep as is, it's cheap), dropped-
   merge detection, and `resetForeignWorkFiles`. Only the build/check block
   is conditionally skipped.

## Acceptance criteria

- [ ] A task whose merged diff touches only `docs/`, `user-docs/`, `*.md`
      files, and/or its own task file skips both the "Full build" and
      "check" steps in `validateCandidate` and still successfully publishes.
- [ ] A task whose diff touches even one file outside that allowlist (e.g.
      one line in `src/`, or `repoos.toml`) runs the full existing gate,
      unchanged — verify with a mixed diff (mostly docs + one `src/` line)
      to make sure the predicate doesn't accidentally pass it.
- [ ] The transcript/log clearly states when and why the fast path was
      taken, listing the qualifying changed paths.
- [ ] Human review (reviewer agent / manual sign-off) is untouched — this
      only changes the automated gate that runs during close-out, after
      review has already approved the task.
- [ ] Standalone `repoos check` behavior is completely unchanged (no edits
      to `src/commands/check.ts`).
- [ ] Tests covering: a pure-docs diff takes the fast path, a mixed diff
      does not, and the #0276/#0271-style retry/classification logic around
      `validateCandidate` still behaves correctly when the fast path itself
      fails for some reason (e.g. the merge step fails before the fast-path
      check is even reached).
- [ ] `repoos check` passes.

## Related

- #0354 — a Docs Debt Agent whose own output is exactly the kind of
  docs-only change this fast path is for.
- #0276 — established the "MTD-flow behaviour change only, never weaken
  standalone `repoos check`" constraint this task follows.

## Activity

- 2026-09-15T13:11:13Z · created · unknown
- 2026-09-15T14:24:22Z · model_override
- 2026-09-15T14:24:25Z · status inbox→ready
