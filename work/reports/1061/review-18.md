---
task: "1061"
pass: 18
at: "2026-11-09T13:58:48.984Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "a8244ef73:a434d494b"
---
Repeated review classes: Pass 17's findings were all one class, git and filesystem entries that are not plain files (submodules, nested repos, symlinks) handled by assumption. This round fixes the uninitialized-gitlink, unborn-nested-repo, handoff-parity and doc-placement findings, and the test gap. Dirty-submodule coverage is only partly fixed. A human should look at this recurring pattern, since each pass has found another instance of it.

## Verdict
good to go — The bookkeeping deferral, drift detection and refusal behave as specified. Submodule fingerprinting goes beyond the final skip-entirely scope, which is a suggestion below.

## Relevance
still relevant — Bookkeeping commits still invalidate running checks, so the fix is worth landing.

## Evidence
None

## Bugs
None found

## Edge cases
- Pass 17 fixed: an empty uninitialized gitlink is no longer fingerprinted by the parent's HEAD (`src/core/git-directory-snapshot.ts:23-49`); `check.ts` and `handoff.ts` share the helper; an unborn nested repo is a stable `repository::unborn:` marker. Tests cover each case.
- Pass 17 edge case: the report-draft `worktreeState` call (`src/server/handoff.ts:1037`) is caught by the outer `try` in `runHandoffFinalization`'s caller (`handoff.ts:1329-1333`). It fails as `validate` with "unexpected error", so it is fail-closed, though the message is generic.
- Test added for the first-parent and merge-commit cases; acceptance criteria all have named tests in `check-gate-bookkeeping.test.ts`.

## Suggestions
- **Scope mismatch (final decision):** the owner's final scope says gitlinks and nested repos are skipped entirely. `gitDirectorySnapshot` still fingerprints them and runs git inside them. Either align the code with skip-entirely or record in the docs why the stricter fingerprint stays. Either way, the docs should state that submodule contents are not covered. `docs/check-run-history.md:28-32` and `user-docs/check.md:293-297` currently say they are covered.
- **Same class, inside the helper (submodule scope):**
  - `git-directory-snapshot.ts:44`: `ls-files -s` without `-z` quotes non-ASCII or special paths, so the `endsWith` match misses them.
  - `git-directory-snapshot.ts:46`: a lookup miss with no `.git` returns a constant `directory:…:not-a-gitlink`. A parent-side pointer change is then invisible, and this branch does not fail closed.
  - `git-directory-snapshot.ts:37-38`: `git status --porcelain` lists names, not content, so a second edit to an already-dirty file inside an initialized submodule is not detected.
- Symlink and revert limitations are documented (`docs/check-run-history.md:17,42`; `user-docs/check.md:302-309`). Limitations (a) and (b) are stated.
- No UI capture applies. The `src/ui-app/**` auto-shot matches a test-only diff, so the STALE note is not a blocker.

## Verdict
good to go — Core deferral and drift logic are sound; submodule fingerprinting exceeds the final skip-entirely scope (suggestion).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

