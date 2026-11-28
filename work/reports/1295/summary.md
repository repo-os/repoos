## TL;DR

The macOS Hub release workflow now attaches `RepoOSHub.dmg` to stable release tags even when no Apple notarization credentials exist: it still builds, validates the bundle, packages the DMG and runs the mounted install check, then uploads with a loud “not notarized” warning and job-summary line. Any partial or present credential set keeps the original fail-closed notarize/staple/verify path, and dry runs without credentials now fail explicitly instead of pretending notarization was tested. The tag trigger no longer carries a path filter. Docs were corrected, including the false Android “falls back to an older release” claim. Reviewed `good to go` on the first pass and closed out with `release:success`.

## Outcome

Shipped a narrow change to `.github/workflows/macos-hub.yml` (+18 / −4). An all-secrets-empty guard runs before any `jq` or notary call: on a real tag release it emits a GitHub Actions warning and a summary stating the DMG is uploaded without a notarization ticket, then lets the build, bundle checks, DMG packaging and mounted install check proceed to upload. On a `dry_run` dispatch with no credentials it instead reports “Notarization not exercised” and fails, so a dry run can never claim a gate it did not run. When any notarization secret is present, behavior is unchanged — incomplete sets, rejection, timeout, staple or verification failures still fail the job before upload, and the upload step remains guarded against dry runs.

The `push` trigger previously combined `branches`/`tags` with `paths`; the path filter was removed so pushed `v*` tags reliably start the release job, while path-scoped pull-request builds and main-branch pushes remain. During final review the pre-existing upload condition was found comparing the boolean `dry_run` input to the string `'true'`; it now uses a boolean comparison, with a test asserting it.

Documentation: `docs/macos-hub-release.md` (+35 / −21) describes both credential states and what maintainers should check in the job summary; `user-docs/macos-hub.md` (+10 / −7) explains the first-launch “Open Anyway” step for un-notarized builds; `user-docs/android-hub.md` (+4 / −2) no longer claims `releases/latest/download/...` searches older releases for a missing asset. Workflow-content coverage in `src/ui-app/tests/hub-workflows.test.ts` (+32) asserts the tag trigger has no path filter, the empty-secret warning and summary exist, no-credential dry runs fail, partial sets still error, notarization gates remain ahead of upload, and upload is dry-run-disabled.

Final verdict: review pass 1, `good to go`; task closed `done` with `release:success` at commit `890a3c3c6e177bc485d205eb88776b09fe739ec3`. No live tag publication or real Apple notary submission was exercised, so this record makes no claim about live secret configuration, Apple acceptance, or an actual uploaded artifact.

## Process stats

- Dev rounds: 1 (engineering round 1, codex / `gpt-6-luna`, started 2026-11-28T00:00:45.608Z, 644s, finished).
- Review rounds: 1 (pass 1, cursor / `composer-2.5`, started 2026-11-28T00:12:14.008Z, 36s, verdict `good to go`).
- Routing: “Model router (jev)”, model unknown, 0s, finished.
- Restarts or model swaps: none recorded. A CLI override and model override are logged at 2026-11-28T00:00:38Z.
- Wall clock, created to done: 2026-11-28T00:00:35Z → 2026-11-28T00:35:37Z (35m 2s). Close-out gate alone: 1085s.
- Tokens: 7,178,897 recorded for the engineer session; reviewer and routing token counts not recorded.
- Cost: not recorded for any session.
- Shots: skipped — “Docs site skipped: no docs shot declared.”

## What went wrong

- **First required check failed on formatting.** The new test tripped the formatter. Fixed by running the repository formatter and re-running the check; a second formatting pass followed the dry-run type fix, and the final tree passed `REPOOS_CHECK_CHANGED=main repoos check` including remote changed-path tests, build, browser gate, user-docs build, local lint/format, UI smoke and rendered-contrast checks.
- **Latent boolean/string mismatch in the upload guard.** The pre-existing condition compared the boolean `dry_run` input with the string `'true'`. Caught during the engineer’s own final review, corrected to a boolean comparison, and pinned with a test so the no-publish guarantee is explicit.
- **Behavioral side effect of the trigger fix.** Removing the whole `push.paths` filter means `build-and-test` now runs on every `main` push, not only `macos/**` changes; the release job itself stays tag/dispatch-gated. GitHub cannot path-filter tags separately inside one `push` block, so this was accepted.
- **No live verification.** No real notarization submission or tag publish was run; correctness rests on workflow YAML and string assertions. No crashes, stalls, failed handoffs or restarts occurred, and no secrets were added, printed or committed.

## Learnings

- An all-empty credential configuration needs its own explicit policy branch *before* credential-set validation, otherwise “not configured” and “partially configured” collapse into the same failure and block a legitimate release.
- A dry run needs a distinct no-credentials outcome. Succeeding without notarization would claim to have tested a gate that never ran.
- Never combine version-tag triggers with path filters when every matching pushed tag must start a release run; the filter can suppress tag runs entirely.
- Test the empty state and each partial state separately — a single non-empty (even whitespace-only) secret correctly forces the fail-closed path.
- These are workflow-specific; the durable home is `docs/macos-hub-release.md`, which now states both credential states and the dry-run rule. No AGENTS.md or ADR change was warranted.

## Follow-ups

None filed. The reviewer’s non-blocking suggestion — split tag release triggers from path-scoped `main` builds if macOS Hub CI cost on unrelated commits becomes noisy — was noted in the review but not filed as a task.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
