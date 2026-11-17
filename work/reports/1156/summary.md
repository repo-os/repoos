## TL;DR

Task #1156 shipped a self-serve dev-build update channel for the RepoOS Hub Android app: the phone now pulls new dev builds over the network via a token-protected Cloudflare Worker + private R2 bucket, with no adb, no ports and no cable. Three engineer rounds and three review passes were needed; review caught two launch-blocking defects in round 2 (per-run CI debug keystores that would break in-place installs, and a Worker-first-run ordering bug). Final verdict `good to go`; task done at 2026-11-17T17:39:37Z with merged commit `9d03c74cab4bb16c35cbd377d4e5fb2a3e49cc88`. Live Cloudflare provisioning, the GitHub/keystore secrets and a real phone install remain human work in dependent task #1158 — until that is done the channel is built but not active.

## Outcome

The feature landed as:

- **Update check in the dev app** (`mobile/src/dev-updates.ts`, `platform.ts`, `App.vue`, `SettingsView.vue`): on app open (at most once an hour) and via a new "Dev updates" Settings row with **Check now**, the dev build (`org.repoos.mobile.dev`) fetches `latest.json` from the private channel URL and shows "A new dev build is available (commit …)" with short notes and **Download now** / **Later** (one-hour snooze). Failures and offline are silent, per spec. The check is compiled in only for the dev package; release builds get empty BuildConfig channel values and a Gradle verification task enforces that.
- **Publisher**: `scripts/publish-dev.sh` plus a `just publish-dev` recipe builds the `.dev` debug APK and uploads the APK and a `latest.json` manifest (versionName, versionCode, commit, builtAt, notes) to the tokenized private URL. `just deploy-phone` (adb) remains as backup and now shares the same channel configuration.
- **Serving infrastructure**: `mobile/dev-update-worker/` (Worker + `wrangler.jsonc`) serves only the two tokenized objects, adds `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Access-Control-Allow-Origin: *` for the WebView fetch; the R2 bucket stays private with the Worker as the only public entry.
- **Automation**: `.github/workflows/publish-hub-dev.yml` runs on push to origin/main — it restores the stable debug keystore from a secret, deploys the Worker before attaching its token secret, and publishes the APK + manifest. Because RepoOS pushes main at release, landings batch into the next release rather than publishing per close-out (the acceptance criteria's "release routine" clause allows this).
- **Release isolation guard**: `scripts/check-mobile-release-channel.sh` builds the mobile web bundle with channel variables removed and fails if the channel host or token appears in the release output.
- **Docs and human setup**: `docs/hub-android-dev-updates.md` explains token creation/rotation and where each side reads it; held human task #1158 holds every step needing Nick's Cloudflare account and his Android debug signing key. No token was generated, printed or committed during the task.

Final state: review pass 3 verdict **good to go**, close-out gate completed (1614 s), status done, `release:success`, branch merged as `9d03c74cab4bb16c35cbd377d4e5fb2a3e49cc88`. The end-to-end behavior on a real phone (dialog on mobile data, in-place upgrade with data kept) is not yet verified and depends on #1158.

## Process stats

- **Wall clock, created → done**: 2026-11-17T14:48:18Z → 2026-11-17T17:39:37Z = 2 h 51 min 19 s.
- **Engineering rounds**: 3 (rounds at 15:49, 16:42 and 17:00 UTC). One recorded engineer session: agent `engineer`, model `gpt-6-luna` (codex), started 15:21:14Z, elapsed 2401 s, 58,276,329 tokens, cost not recorded. No engineer restarts or model swaps are recorded; one model override + CLI override event is logged at 15:21:05Z.
- **Review passes**: 3, all by agent `reviewer`, model `opencode-go/deepseek-v4.1-flash` (opencode). Pass 1: 597 s, 81,636 tokens, cost 0.03400458 — needs some work. Pass 2: 640 s, 107,743 tokens, cost 0.04002059999999999 — needs some work. Pass 3: 645 s, 86,072 tokens, cost 0.046769154 — good to go. Reviewer totals computed from those recorded values: 275,451 tokens and 0.120794334 cost. One routing session per pass (Model router, openrouter, ~1 s each, tokens/cost not recorded).
- **Shots**: skipped on all three handoffs — the diff touched no capture target's globs (the mobile shell is not a capture target).
- **Branch**: `feat/hub-android-dev-build-update-channel-new`, 21 changed paths at final handoff.

## What went wrong

- **First engineer turn ended without a handoff** (15:32:42Z): the turn exited cleanly without requesting review, and its stderr showed repeated `apply_patch` verification failures against `mobile/src/dev-updates.ts`. The work was completed and the task reached review at 15:49:27Z.
- **Review round 1 found a batch of functional defects** (verdict "needs some work", 15:59): missing CORS header that would silently block the WebView fetch of `latest.json` entirely; undefined CSS tokens and non-existent button classes in the update dialog; the Settings card gated on children instead of the container (empty card in release builds); `just build-android` never cleaning, so a stale `versionCode` could ship in the APK while `latest.json` claimed a newer one (Android would refuse the install); channel configuration injected only by the publish script, so the documented adb backup path produced a dev APK with updates disabled; #1158 setup steps contradicting the deployment; and changelog notes built from git subjects instead of landed task titles. All were fixed in round 2.
- **A resumed engineer turn also ended without a handoff** (16:24:08Z), this time with a file-write failure in `mobile/dev-update-worker/index.ts` in the stderr. The watchdog auto-surfaced the stuck task at 16:09:57Z and a CLI handoff was requested; a queued message then deferred handoff at 16:24:07Z until delivered.
- **Handoff failed at the check gate** (16:30:35Z): `tests/check-reuse.test.ts > handoff self-check reuse > CLI records clean self-check proof, partial=false on bee` failed. It was fixed in the feature branch and the gate re-run; the task reached review at 16:42:57Z.
- **Round 2 review found two launch blockers** (verdict "needs some work", 16:53): (1) CI's empty home directory caused Android to regenerate a fresh debug keystore every run, so no published APK could ever install over Nick's existing dev app — fixed by restoring the laptop's keystore from a `HUB_DEV_DEBUG_KEYSTORE_BASE64` secret, with #1158 extended to cover provisioning it without printing the key; (2) the workflow ran `wrangler secret put` before `wrangler deploy`, which fails on a fresh account and aborts the job — fixed by deploying the Worker first. Round 2 also surfaced an incidental blocker during verification: Capacitor sync could not write a read-only iOS generated file, resolved by restoring write permission in the worktree.
- **Earlier build tooling issues**, resolved within round 1: the first mobile build failed on missing Capacitor packages (mobile dependencies not installed in the fresh worktree), and the local release build caught a wrong browser-plugin API (`Browser.open` vs the installed `InAppBrowser.openInExternalBrowser`).

## Learnings

- **App identity and update eligibility must be sourced by the native build itself** (Gradle `BuildConfig` from env or a gitignored file), not only by the publish script — otherwise a routine developer build silently disables the feature or pairs a stale `versionCode` with a newer manifest. Round 1's review proved this concretely.
- **Debug signing is still signing identity**: any CI that publishes a debug-signed APK must receive the same keystore as the developer workstation, or in-place installs fail with a signature conflict. Durable enough to belong alongside `docs/hub-android-dev-updates.md` (already written there) and worth a line in `mobile/README.md` if more CI-published Android work follows.
- **Provider resource ordering matters in first-run automation**: deploy a Worker before attaching Worker-scoped secrets; the human checklist must state the same sequence as the workflow. Generalizes to "first-run provisioning must self-heal, not abort hidden behind output suppression."
- **A tokenized URL is not an access control by itself**: server-side gating and `X-Robots-Tag: noindex` on the Worker are still required, and the bucket must never be publicly listed or domain-bound.
- **Task titles make better release notes than git subjects**, which are dominated by merge and checkpoint messages.
- **Cross-origin response contracts need testing alongside server-side checks** — the Capacitor `https://localhost` origin means a missing CORS header silently kills the whole feature since failures are intentionally invisible.
- **The watchdog/CLI handoff path worked as designed** for turns that exit cleanly without emitting `::repoos-handoff-ready::`, but two such exits on one task suggests handoff-signal reliability in the codex runner deserves a look; if it recurs, a line in `docs/agent-workflow-rules.md` or an incident note in `docs/agent-debugging-and-incidents.md` is the right home.

## Follow-ups

- **#1158** (dependent, inbox, held human task): Nick must provision the private R2 bucket, the Worker route, the four GitHub Actions secrets (including the base64 debug keystore) and verify the first live publish and a phone install — the channel cannot go live without it, and the feature's last acceptance criterion (new builds reaching the phone) remains unproven until then.
- No other tasks were filed as a result of this task. The reviewer's pass-3 suggestions (run the release-channel guard in `android-hub.yml` PR/release jobs; dismiss the dialog after Download now; scrollable notes list; an "up to date" result for Check now; monotonic versionCode derivation; `--diff-filter=d` in the changelog scan) were noted but not landed in this task and have no filed task.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
