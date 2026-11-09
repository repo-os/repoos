---
task: "1061"
pass: 17
at: "2026-11-09T13:04:13.298Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "fd3f3745d:a434d494b"
---
Repeated review classes: Pass 16's three findings are mostly fixed. Symlinks and gitlinks no longer throw, the lock only chmods regular files, and unreadable handoff paths now fail closed. The same class keeps recurring, though: git and filesystem entries that are not plain files (submodules, nested repos, symlinks) are handled by assumption rather than by inspection. This pass finds new instances of it, plus the part of the pass-16 submodule finding that was not fixed. A human should look at this recurring pattern.

## Verdict
needs some work — Submodule snapshots read the parent repo's HEAD and ignore submodule edits; bookkeeping can still invalidate a check.

## Relevance
still relevant — Bookkeeping commits still invalidate running checks on main, so the fix is worth landing.

## Evidence
None

## Bugs
Class: **git commands run in a directory that may not be its own repository, and gitlinks are fingerprinted by HEAD only.** I reproduced the first point in /tmp: `git -C <empty dir> rev-parse HEAD` returns the parent repo's HEAD, exit 0. Instances:

- **Uninitialized submodule invalidates checks.** `src/commands/check.ts:1945-1948` records `directory:<mode>:<rev-parse HEAD>`. For an empty, uninitialized gitlink, that HEAD is the parent's. Every bookkeeping or WIP commit then changes the snapshot, so `trackedSourceSnapshotDrift` refuses with the path listed. This is the exact symptom the task removes.
- **Same bug in handoff.** `src/server/handoff.ts:503-507` (`worktreeState`) has the same directory branch.
- **Nested repo with no commits.** `git -C nested rev-parse HEAD` exits 128 for an untracked nested repo. `check.ts:1949` returns `null`, so the gated check fails closed on every run. `handoff.ts` now throws there, where it previously recorded a stable marker, so this is a handoff regression.
- **Dirty submodule edits pass undetected.** Both sites record only the submodule's HEAD. An edited file inside an initialized submodule leaves that HEAD unchanged. This is the unfixed part of pass 16's third finding, and it breaks the "any net source change is detected" rule. `check-gate-lock.ts` also skips directories, so submodule files are not protected either.
- **Docs overstate coverage.** `docs/check-run-history.md` and `user-docs/check.md` say RepoOS hashes tracked source files, which is not true for submodule contents.
- **Test gap.** The new gitlink test covers only a clean, initialized submodule. Nothing covers uninitialized, dirty, or untracked-nested cases.
- **Misplaced docs.** In `docs/check-run-history.md`, the new section sits above the file's H1 and a second `# Check-gate worktree protection` H1 is appended with no blank line.

## Edge cases
- `handoff.ts:~1038` (report-draft path) calls `worktreeState` outside the `try`/`fail` wrappers used at `:831` and `:973`. A throw there is not converted to a refusal. I did not verify the caller's catch around `:1322`.
- Symlink snapshots record only link text. A link to a file outside the worktree that changes content is not detected. This is acceptable, but the docs should say so.

## Suggestions
- Fix the class in one round: confirm each directory is its own repo (`--show-toplevel` equals the path). For an uninitialized gitlink, use the index SHA from `git ls-files -s`. For an initialized one, also hash its `git status --porcelain` output. Apply the same fix in both `check.ts` and `handoff.ts`.
- Add tests for an uninitialized gitlink, a dirty submodule file, and an untracked nested repo with no commits.
- The stale auto-capture on `src/ui-app/**` matches a test-only diff and is not evidence for this task. It is not a blocker.
- Accepted limitations (a) and (b) are documented in `user-docs/check.md` and `docs/check-run-history.md`.

## Verdict
needs some work — Submodule snapshots read the parent repo's HEAD and ignore submodule edits; bookkeeping can still invalidate a check.

## Automated verification
- Browser console-error check: **skipped** (no UI behavior changed).
- Guard negative-test evidence: **skipped** (no check guard rules materially changed).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

