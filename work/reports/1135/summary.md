## TL;DR

After `repoos done` merged #1128, the Done card wrongly showed "Needs input" because close-out kept the worktree over the `.env` symlink RepoOS itself provisions — a link that only looks like uncommitted work once a half-completed worktree removal has deleted the worktree's `.gitignore`. The fix teaches the shared dirty-worktree predicate (`uncommittedWorkFiles` in `src/core/git.ts`) to discount provisioned paths: untracked entries that are symlinks into the main checkout or paths main's own ignore rules cover. All close-out, handoff, review, restart-dialog and `/done` call sites pass the main root so every guard agrees. A real uncommitted change still keeps the worktree and names itself in `needs_input`. Unit and end-to-end tests cover the symlinked `.env`, main-ignored paths, symlinks outside main, tracked modifications, and the full cleanup path. One review pass returned `good to go`; the task is done.

## Outcome

Close-out no longer keeps a worktree — or flips a Done card to "Needs input" — merely because the RepoOS-provisioned `.env` symlink sits in it. The invariant "RepoOS-provisioned paths are not task work" now lives in one place: `uncommittedWorkFiles` gained an opt-in `ignoreProvisionedFromMain` option, and every "is there uncommitted task work?" caller (close-out cleanup, both preflight functions, `POST /api/tasks/:id/done`, the restart dialog endpoint, the pre-review remote gate, the handoff snapshot comparison and the worktree-handoff guard) passes `config.root`. The discount is deliberately narrow: only untracked (`??`) entries, only symlinks resolving into the main checkout (checked both by resolved target and literal destination, so a dangling `.env` link still counts) or paths `git check-ignore` reports in main. Failures are conservative — a `check-ignore` error discounts nothing. Final verdict: review pass 1 returned `good to go`, and the task closed as done with `release:success`, merged commit `36d022261714b4c21ce1ddbb177c6734a639e767`.

## Process stats

- Dev/review rounds: 1 engineering round, 1 review pass (verdict `good to go`).
- Wall-clock created → done: 2026-11-15T17:07:22Z → 2026-11-15T18:30:45Z, i.e. 1 h 23 min 23 s.
- Engineer: `opencode-go/deepseek-v4.1-flash`, session started 17:15:40Z, elapsed 2700 s (~45 min), 158,493 tokens, cost 0.06971063400000002 (as recorded). Status finished.
- Reviewer: `composer-2.5`, elapsed 50 s, tokens/cost not recorded. Status finished.
- Routing: Model router (openrouter), two 0–1 s sessions, tokens/cost not recorded.
- Restarts or model swaps: none recorded.
- Close-out gate: completed in 567 s.
- Shots: skipped — the diff (14 changed paths) touches no capture target's globs.

## What went wrong

- **Five engineer turns ended without a handoff (exit code 130), each cut short to deliver a queued CTO nudge** (17:37:10, 17:49:10, 17:57:10, 18:02:10, 18:06:25). The CTO monitor sent completion reminders after 5-minute worktree-activity gaps and, when a queued message sat undelivered with no engineer output, ended the turn so it would be delivered. The final turn's last assistant message ("Re-running the check:") shows at least one turn was interrupted mid-`repoos check`. Resolution: the queued message was delivered on the next turn and the engineer eventually completed and handed off at 18:09:25. Several later nudges were correctly held while an undelivered message was already queued (17:39:07, 17:49:07, 18:04:07) or the handoff gate was running (18:09:07).
- **Scoped check failed once on two remote-validation tests unrelated to the diff**: `agent-review.test.ts`'s land-anyway guard (its own comment notes a full-suite-load race that widens the auto-bounce window) and a `remote-host-pool` host-lock timeout. Both passed locally in isolation (the host-lock test in 176 ms); a re-run of the check was fully green. No code changes were made for these — treated as load flakes, per the debugging playbook.
- **Test-helper wrinkle**: the fixture `git()` helper trims output, eating the leading space of porcelain's ` D` column; the status assertion compares trimmed lines instead of raw porcelain text. Resolved in the test itself.

## Learnings

- **"Untracked" is relative to the tree's own ignore rules.** A partially deleted worktree loses its `.gitignore`, so files RepoOS provisioned suddenly appear as leftover work. That is why the bug looked intermittent and why fix-in-one-caller would have been wrong. Durable phrasing: worktree cleanup cannot trust `git status` alone when the worktree may be in a half-removed state.
- **Provisioned-vs-data needs an explicit, conservative predicate** (symlinks into the main checkout, paths main ignores; unknown or tracked stays work). Where it belongs: this is now documented in `docs/close-out-pipeline.md` (worktree-cleanup invariant) and `docs/previews.md` (`inheritEnv`), which shipped with the change — no further AGENTS.md edit identified.
- **Single-sourcing the predicate beats patching call sites.** Because the main root was added to `uncommittedWorkFiles` itself, close-out, `/done`, handoff, review gate and restart UI agree by construction. This pattern — put shared invariants in the predicate, not the orchestrator — is worth remembering for future "same check in N places" bugs; candidates for a line in `docs/agent-workflow-rules.md` if it recurs.
- **Process-level**: when a monitor's queued message forces turn endings, the engineer's in-flight long checks get interrupted repeatedly. If this pattern recurs across tasks, the CTO nudge/delivery policy may need a rule about not ending a turn while a check is demonstrably running — file it as a task rather than editing policy unilaterally (none was filed for this task).

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
