## TL;DR

RepoOS Hub for Android gained the same public download path the macOS DMG already had: a new `.github/workflows/android-hub.yml` builds a release-signed `RepoOSHub.apk` on every stable `v*` tag, refuses a debug-signed APK, and attaches it to the GitHub Release. The landing page has a "Download for Android" card with the sideload/Android 8.0 note, the docs site has a full Android Hub guide wired into nav and getting-started, and a local `just build-android-release` recipe builds and verifies the same artifact. Actual publishing is still gated on the human keystore task (#1129); until those secrets exist the workflow skips the APK with a clear job-summary note and leaves the release green. One review pass returned "good to go"; the task merged cleanly and closed out in 281 s.

## Outcome

The task shipped the full Android release pipeline, mirroring `macos-hub.yml`:

- **CI workflow** (`.github/workflows/android-hub.yml`, +191 lines): triggers on `v*.*.*` tags and `workflow_dispatch` with an existing tag, builds the Capacitor web assets, and uploads `RepoOSHub.apk` to the tag's release with the same prerelease gating and `softprops/action-gh-release@v2` handling as the DMG. A `build-debug` job also compiles the debug APK on PRs and `main` pushes so Android breakage is caught before a tag.
- **Release signing**: `mobile/android/app/build.gradle` gained a `release` signingConfig fed only from `REPOOS_ANDROID_KEYSTORE_*` env vars / Gradle properties. A task-graph guard fails release builds naming all four variables when they're missing; no keystore or password is committed (`*.jks`/`*.keystore` are gitignored).
- **Versioning**: `versionName`/`versionCode` derive from the release tag (`REPOOS_APP_VERSION`, fallback to `mobile/package.json`; versionCode = major×10000 + minor×100 + patch), so each release installs over the previous. The workflow cross-checks the built APK's versionName against the tag via `aapt dump badging`.
- **Debug-key refusal**: `mobile/scripts/verify-release-apk.ts` (+239 lines) runs `apksigner verify --print-certs`, requires exactly one signer, and compares the APK to the configured release keystore (and rejects the local debug keystore). The release certificate SHA-256 is printed to the job summary. Both outcomes were exercised locally with a temporary keystore.
- **Landing page & docs**: a separate Android download card (linking `releases/latest/download/RepoOSHub.apk`) below the Mac card, `user-docs/android-hub.md` (+154 lines) covering install, certificate verification, updates and the privacy model, sidebar nav, getting-started links to both Hubs, and updates to `docs/releases.md`, `mobile/README.md` and the root README.
- **Local build**: `just build-android-release [tag]` validates signing vars, builds/cleans/syncs, and runs the same verifier.

**Final verdict:** review pass 1 — **good to go**. Merged as commit `e23a1db4eefb90b25bd1aa2800b1f43250ba9ca7`, status `release:success`. Four shots captured (both landing targets and both docs targets), the automatic shot being pre-empted by engineer-made captures.

The release APK itself has not yet been published: that requires the signing secrets from the human task #1129.

## Process stats

| Metric | Value |
| --- | --- |
| Wall-clock, created → done | 3 h 27 m 46 s (2026-11-15T13:35:11Z → 17:02:57Z) |
| Dev rounds | 1 (single engineering round) |
| Review passes | 1 — verdict "good to go" |
| Engineer | opencode-go/deepseek-v4.1-flash, 1 session, elapsed 5973 s (1 h 39 m 33 s), 166,887 tokens, cost $0.096961194 |
| Reviewer | composer-2.5, elapsed 66 s, tokens/cost not recorded |
| Routing sessions | 2 (openrouter model router), 1 s each, model unknown, tokens/cost not recorded |
| Crash restarts | 1 crash-recovery resume (same model), 1 orphaned engineer process stopped (pid 4322), 1 watchdog restart |
| Close-out gate | 281 s, completed successfully |

## What went wrong

- **Handoff failed at UI verification (one crash).** At 14:34:07 the engineer agent exited with an error: "preview for 'Landing page' did not start: preview server for #1128 did not become ready." The root cause was environmental: remote capture creates a fresh task worktree that installs only the repo root's dependencies, so the standalone `landing` package had no `node_modules` and its preview never came up. Crash recovery resumed the session (1/3 crashes in 30 m) and the fix shipped in the change: `landing` and `user-docs` now run `bun install --frozen-lockfile` from a `predev` script, making their `dev` commands self-sufficient in a fresh checkout.
- **Shot route rejected hash.** The declared route `/#android-hub` doesn't work because the capture gate compares pathnames and ignores the hash; the engineer changed the shot to route `/` with `#android-hub` as a `highlight`. After both fixes, `repoos shot --task 1128` captured both targets on the runner.
- **Repeated stalled turns and CTO nudges.** Between 14:24 and 16:23 the CTO sent repeated completion reminders after 5-minute worktree-activity gaps; at least eight turns were ended (exit code 130) specifically to deliver a queued message rather than reaching a handoff. This burned most of the session's wall-clock without changing the code and is the main reason the task took ~3.5 h for ~1.6 h of engineer work.
- **Unrelated remote-runner test flakes.** Later gate runs failed on rotating tests (`agent-review`, `serve-guard`, host-pool timing) — a different test each run. The engineer diagnosed these as remote-runner flakes and re-ran the scoped gate locally, which went green, then refreshed the shot evidence against the merged tree before handing off.
- **Leftover state at close-out.** Close-out kept a worktree with uncommitted changes (recorded at 17:02:57); the merge and release succeeded regardless, and the queued message at handoff was discarded when the task completed.

## Learnings

Durable ones worth carrying forward:

- **Standalone subprojects must be install-aware for remote capture** — remote preview capture installs only root dependencies, so any preview target served by a subpackage needs its own dependency-ensuring `dev` command. This generalizes beyond `landing`/`user-docs` and belongs in `docs/agent-ui-and-preview-conventions.md` (the `predev` pattern is already documented in the two subproject READMEs).
- **A shot route's hash is not part of the capture gate's comparison** — section anchors must be expressed via `highlight`, not the route. Also belongs in `docs/agent-ui-and-preview-conventions.md`.
- **Gradle does not reliably rebuild when an env-derived `versionName` changes** — repeatable release builds need `clean` (or an explicit version check) or they can ship the previous version's APK. Documented in `mobile/README.md`; worth a line in `docs/mobile-architecture.md` if it recurs.
- **Verify APK signing against the configured release keystore, not a hard-coded debug fingerprint** — local debug keystores are generated per machine, so a baked-in debug SHA-256 is not a reliable contract. This rationale is captured in `mobile/scripts/verify-release-apk.ts` and `mobile/README.md`.
- **Shared landing copy across platforms quietly overpromises** — folding Android into the Mac section implied Cmd-K, Dock badges and Keychain tokens the mobile shell lacks. Keep per-platform download cards separate.
- **Process observation:** the repeated nudge/queue/end-turn cycle (eight+ turns ended just to deliver a message) suggests the CTO reminder cadence interacts badly with a running scoped check. Worth a look in `docs/agent-workflow-rules.md` or the CTO monitor design if it recurs across tasks.

## Follow-ups

- **#1129** (dependent, inbox, created 2026-11-15T13:35:22Z): Create the RepoOS Hub Android release keystore and add the GitHub signing secrets — the human-only step that gates actual APK publishing; until it lands, tagged releases skip the APK upload by design.
- Suggested but **not filed as a task**: after #1129, run one `workflow_dispatch` on a stable tag to confirm `RepoOSHub.apk` attaches beside the DMG (reviewer suggestion).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
