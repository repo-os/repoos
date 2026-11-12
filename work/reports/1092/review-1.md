---
task: "1092"
pass: 1
at: "2026-11-12T01:18:31.583Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-email-repoos-release-email-previ
state: ok
tree_identity: "e2d60e8d3:"
---
## Verdict
good to go — CLI calls the existing preview route, is registered in parity, and tests cover success and unknown-version paths.

## Relevance
still relevant — `main` has no `repoos release` command, and the preview route is still HTTP-only without this wrapper.

## Evidence
None

## Bugs
None found

## Edge cases
- `src/commands/release.ts` `cmdReleaseEmailPreview`: `new RepoOsApi(...)` sits above the `try`. If `boardRoot()` or `loadConfig()` throws (no repo, invalid `repoos.toml`), the rejection escapes `cmdRelease`, and `src/cli/index.ts` `.then(...)` has no `.catch`. Sibling commands in `src/commands/control-api.ts` (about nine sites) and `reminder.ts` use the same placement, so this is house style rather than a regression. It is an edge case, not a blocker.
- Argument order is strict: `release --preview 1.0 email` and `release email --preview 1.0 extra` both print usage. This is intentional and safe.
- A version beginning with `-` is treated as a flag or usage error. No release version currently looks like that.
- The unknown-version path is covered by a mocked `requestOk` rejection. It is not tied to the real route's 404 body, which comes from `previewReleaseEmail`'s "No release notes are recorded" error. That is consistent, but it is unverified end to end.
- The command never sends mail: the only route called is GET, and no send route is referenced.
- No bare `node`, `npm`, or `npx` appears in the diff. Zero runtime dependencies are preserved.

## Suggestions
- Move `new RepoOsApi(...)` inside the `try` in `cmdReleaseEmailPreview`, or wrap the `cmdRelease(rest).then(...)` call in `src/cli/index.ts` with a `.catch`. Doing it in the new file only would leave the sibling pattern alone.
- Move the new tests from `src/ui-app/tests/release-email.test.ts` next to the command, for example `src/commands/release.test.ts`. The current location is UI-app-scoped, and the CLI test does not need the release-email fixtures for its own assertions.
- Add a parser test for `--json` and `--port` validation, since those branches have no coverage.
- `docs/releases.md` now points maintainers at the command. That is correct and consistent with the help entry.

## Could not verify (environment)
- `git merge-tree` and `repoos landable` were not run, per instructions. The server checklist reports only the task file conflicting with main, which close-out resolves.
- Tests and `repoos check` were not re-run, per instructions. Passing at handoff is taken from the engineering report.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

