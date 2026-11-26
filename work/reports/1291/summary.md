## TL;DR

Three GitHub workflows that had been failing since the v0.5.93/v0.5.94 releases were repaired in a single engineering round and merged within 38 minutes of task creation. Android SDK setup no longer depends on a removed default package, and the macOS workflow no longer uses the `runner` context where GitHub forbids it. A regression test now guards both classes of breakage. Review verdict: `good to go`.

## Outcome

The task fixed the two distinct failure modes that were shipping releases without Hub apps.

**Android (`android-hub.yml`, `publish-hub-dev.yml`).** Every `android-actions/setup-android@v3` step now passes an explicit `packages: ""`, so the action is not asked to install a package list that no longer resolves — the reported `Failed to find package 'tools'` failure. The packages the build actually needs are installed in visible `sdkmanager` steps instead: `platforms;android-36` and `build-tools;36.0.0` in each Android Hub job that builds an APK, with the release verification step's `aapt` resolving from that same build-tools directory. The dev publish workflow keeps its existing `sdkmanager` invocation, which already installed platform 36 and build tools 36.0.0.

**macOS (`macos-hub.yml`).** Job-level `env` no longer references `${{ runner.temp }}`, which GitHub rejects outright — the cause of the 0-second "workflow file issue" runs and the `context "runner" is not allowed here` errors `actionlint` 1.7.12 reported at lines 35, 36 and 65. The build-and-test job now writes both `REPOOS_MACOS_DERIVED_DATA` and `REPOOS_MACOS_XCRESULT_DIR` to `$GITHUB_ENV` from its first step using the `$RUNNER_TEMP` shell variable. The release job initializes its own copy, since GitHub Actions jobs do not share environments.

**ShellCheck SC2193.** Both files embedded `${{ ... }}` expressions directly in shell `[[ ... == *-* ]]` prerelease comparisons. Each step now assigns the tag to a `RELEASE_TAG` environment variable and tests that variable for a hyphen, preserving behaviour while removing the generated-script pattern that ShellCheck flagged.

**Regression coverage.** A new Vitest test, `src/ui-app/tests/hub-workflows.test.ts`, parses the workflow files and fails if any `setup-android` step omits an explicit empty `packages` input, or if a macOS job-level `env` block contains a `runner.*` expression.

**Docs.** `docs/hub-android-dev-updates.md` and `docs/macos-hub-release.md` record the explicit-SDK-install and temp-directory conventions.

Six paths changed (three workflows, one test, two docs) relative to base tree `2a45652`; source tree `28ba4d6` was reviewed and the branch merged as `6b31b18`. The scoped `repoos check` passed, review pass 1 returned `good to go`, and the close-out gate completed successfully with `release:success`.

**Unverified, as the task anticipated:** the real Xcode build, notarization, and GitHub Release upload cannot be proven from a local environment, and no release, tag push, or publish was triggered — the task forbade it. Confirmation of green tag-driven runs of `android-hub` and `macos-hub` remains post-land work.

## Process stats

| Item | Value |
| --- | --- |
| Engineering rounds | 1 |
| Review passes | 1 (state `ok`, verdict `good to go`) |
| Wall-clock, created → done | 2026-11-26T03:56:34Z → 2026-11-26T04:34:16Z (37m 42s) |
| Created → first review request | 2026-11-26T03:56:34Z → 2026-11-26T04:04:57Z (8m 23s) |
| Review pass 1 → close-out gate complete | 2026-11-26T04:05:30Z → 2026-11-26T04:33:59Z (28m 29s) |
| Close-out gate duration | 968s |
| Engineer | `engineer`, model `gpt-6-luna`, started 2026-11-26T03:56:44Z, 453s elapsed, 3,845,033 tokens, cost not recorded |
| Reviewer | `reviewer`, model `composer-2.5`, started 2026-11-26T04:05:00Z, 30s elapsed, tokens and cost not recorded |
| Routing | `Model router (jev)`, model unknown, started 2026-11-26T04:04:58Z, 0s elapsed, tokens and cost not recorded |
| Restarts / swaps | none recorded |
| Total tokens | 3,845,033 recorded (engineer only; reviewer tokens not recorded) |
| Total cost | not recorded |
| Shots | skipped — 8 changed paths touched no capture target's globs, no UI change |

## What went wrong

**The reported CI failures themselves.** Android runs died in `sdkmanager` with `Warning: Failed to find package 'tools'`, exit code 1, because `setup-android@v3` was left to install its default package list. macOS runs never started: GitHub rejected `macos-hub.yml` as a workflow file issue because job-level `env` used `${{ runner.temp }}`, which `actionlint` 1.7.12 caught at lines 35, 36 and 65. Both were resolved by the changes above.

**Documentation contradicted the incident report.** The setup-android docs describe the current default as `platform-tools`, while the observed failure names the removed `tools` package. Pin behaviour and docs may have drifted apart. The engineer did not chase the discrepancy: explicit `packages: ""` makes the step deterministic regardless of which default the pinned action carries, and project packages are installed separately.

**The guard test first landed in the wrong suite.** It was initially written under `src/core`, but this repo's Vitest configuration only discovers `src/ui-app/tests/**/*.test.ts`, so it would never have run. The engineer moved it into that suite before checking. A first assertion also exposed an overly broad regular expression in the test's text matching, which was corrected.

**The first scoped check failed at the format gate.** It exercised remote validation successfully but the new test file failed formatting, and dependent gates skipped. The engineer ran the repository formatter and reran the exact same scoped check, which passed. Note the check's own WIP checkpoint commit was created by the tool, not by hand-staging.

**An unrelated pre-existing warning was left alone.** `actionlint` over the whole `.github/workflows/` directory still reports SC2193 in `release.yml`, a file this task did not touch. The three changed workflows lint clean with no expression or ShellCheck warnings, which is the acceptance criterion the task set.

## Learnings

- **Never rely on a GitHub Action's default package list.** Declare the action's package input explicitly and install project-specific SDK packages in a visible `sdkmanager` step, so a default that changes under a pinned tag cannot break the build. The reasoning is recorded in `docs/hub-android-dev-updates.md`; the general rule is worth a line in `AGENTS.md` or a CI-section note in `docs/` if this recurs.
- **The `runner` context is only valid in steps, not in job-level `env`.** Materialise runner-specific paths from `$RUNNER_TEMP` during step execution and export them via `$GITHUB_ENV`; each job must initialise its own copy because job environments are separate. Captured in `docs/macos-hub-release.md`.
- **Keep `${{ }}` expressions out of inline shell comparisons.** Interpolating them into `[[ ... ]]` produces generated scripts ShellCheck cannot analyse (SC2193) and hides quoting hazards. Assign to an environment variable and compare that. A durable note belongs in `docs/agent-ui-and-preview-conventions.md`'s CI guidance or a short `docs/` page on workflow authoring.
- **Workflow linting belongs in the normal suite.** The failure modes here were statically detectable, so a test that parses workflow YAML is cheaper than a red release. The technique in `src/ui-app/tests/hub-workflows.test.ts` — assert against raw file text rather than shelling out to `actionlint` — is portable to other workflow guards.
- **Verify where a new test will actually be discovered.** `src/core` looks like the natural home for a repo-wide guard, but the Vitest config only scans `src/ui-app/tests/**/*.test.ts`; a test in the wrong tree passes silently by never running.

## Follow-ups

None recorded — the activity log, review passes and linked-tasks section list no new tasks filed from this work.

Two items surfaced in review deserve tracking if not yet filed, and are stated here rather than invented as task ids:

1. **Widen the guard test** to every file under `.github/workflows/`, so future Android jobs or job-level `env` blocks are covered automatically (reviewer suggestion; the current test covers all present call sites).
2. **Watch one tag-driven `android-hub` and `macos-hub` run after landing** to confirm the Xcode build, notarization, Release upload and SDK installation on real CI — the acceptance path the task explicitly deferred.

The unrelated SC2193 in `.github/workflows/release.yml` is also unfixed and outside this task's scope.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
