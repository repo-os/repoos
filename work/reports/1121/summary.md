---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task #1121 shipped `just deploy-phone`: a one-command Bun/TypeScript port of the Laisen/Tiao Tailscale-over-adb deploy flow for the RepoOS Hub Android app. It builds the debug APK via `just build-android`, connects over Tailscale adb (saved address → other open ports → 30000–49999 scan), installs with `adb install -r -d`, force-stops, launches, and prints the short commit. Debug builds now carry `applicationIdSuffix ".dev"` (`org.repoos.mobile.dev`, launcher label "RepoOS Hub Dev") so they install beside the release build; the release id is unchanged. Phone targets come only from `REPOOS_HUB_PHONE` / `REPOOS_HUB_PHONE_PORT` / `~/.config/repoos-hub/phone` — no default IP in the repo. Vitest fakes cover connect, fallback, scan, launch-component validation, the signature-mismatch message and `--no-build`/`--no-scan`; docs live in `docs/phone-deploy.md` plus a `mobile/README.md` pointer. No real install was run, by design. Review verdict: good to go (pass 1); task done with release:success. The run was bumpy: three engineer turns ended without a handoff, two handoffs failed (worktree changed mid-gate; finalization timeout), and one watchdog restart was needed.

## Outcome

**Shipped (merged commit `4209ec5cc9bb70311cbdd2b45b491d326ee4dc27`, 12 changed paths):**

- `scripts/deploy-phone.ts` (CLI), `scripts/lib/hub-phone-deploy.ts` (testable core with injectable adb runner, sleep and port scan), `scripts/lib/launch-component.ts` (builds fully qualified `<application id>/<fully.qualified.MainActivity>`, rejects relative/malformed activity classes). TypeScript-for-Bun per repo convention, not bash.
- Target resolution: `REPOOS_HUB_PHONE` (ip:port), then `REPOOS_HUB_PHONE_PORT` + IP from the saved config, then `~/.config/repoos-hub/phone`. Unlike Laisen, nothing is baked in: with nothing configured the script exits with a clear setup message. The last working `ip:port` is persisted back to the config file.
- Connection behaviour matched to the Laisen reference (read on the thinkpad; Tiao copy used for env naming): saved address first, then other wireless adb serials for the same IP, then a TCP 30000–49999 scan (`nmap` when present, otherwise concurrent socket probes); ~1 s wait after `adb connect` before `adb get-state` must say `device`.
- Justfile `deploy-phone *FLAGS` recipe in the mobile group, with `--no-build`/`--no-scan`; build goes through `just build-android` so Capacitor web sync stays aligned.
- Gradle: `debug { applicationIdSuffix ".dev" }`; release `applicationId` stays `org.repoos.mobile`. New `mobile/android/app/src/debug/res/values/strings.xml` sets the debug launcher label **RepoOS Hub Dev** without touching release strings. APK outputs and Gradle caches are already gitignored.
- Tests under `src/ui-app/tests/` (`hub-phone-deploy.test.ts`, `hub-android-debug-label.test.ts`) run without a phone, JDK or Android SDK.
- `docs/phone-deploy.md` (+ pointer in `mobile/README.md`): adb/JDK/SDK setup, Tailscale naming, fixed port 5555 vs Wireless debugging (random port, resets on network changes), the Tailscale warning-triangle toggle, the one-connection-at-a-time Wireless debugging limit, and unreachable-phone steps.

**First real install — for Nick's approval (acceptance criterion 7):** the first live `just deploy-phone` installs **`org.repoos.mobile.dev`** (debug, self-signed debug key only). Because of the suffix it installs **beside** an existing `org.repoos.mobile` release build rather than replacing it; it replaces only an older dev build with the same `org.repoos.mobile.dev` id. Launch uses the fully qualified `org.repoos.mobile.dev/org.repoos.mobile.MainActivity`. No `adb install`, `adb pair` or `tcpip 5555` was executed in this task.

**Final verdict:** review pass 1 — `good to go`; closed out as `done` with `release:success`.

## Process stats

- **Engineering rounds:** 2 (round 1 finished 2026-11-14T18:49:53Z, round 2 finished 2026-11-14T19:24:49Z; both reported by the same engineer agent).
- **Review passes:** 1 — `good to go`, 2026-11-14T19:17:42Z.
- **Wall-clock, created → done:** 2026-11-14T17:35:18Z → 2026-11-15T01:21:07Z = **7 h 45 m 49 s**. Of that, ~3 h 36 m elapsed between the review verdict (19:24:49Z) and close-out completion, dominated by the close-out gates and a queued message that sat undelivered.
- **Agents and models:**
- Engineer: cursor · composer-2.5 (both rounds). One watchdog restart (18:59:55Z, after 10 m with no live process); the restart's model is not recorded.
- Reviewer: cursor · composer-2.5, session elapsed 49 s.
- Routing (Model router, openrouter): 2 s, model "unknown".
- Engineer session as recorded in the sessions table: elapsed 1979 s (~33 min), **2,000 tokens** (the figure as recorded). Reviewer/routing token counts: not recorded.
- **Costs:** not recorded for any session.
- **Close-out:** two gate completions — 2026-11-15T00:47:38Z in **712 s** and 2026-11-15T01:20:51Z in **302 s**; the task moved to done at 01:21:07Z.

## What went wrong

- **Three turns ended without a handoff.** The engineer exited cleanly at 17:46:54Z, 17:59:09Z and 18:10:54Z (exit code 143, "ended to deliver a queued message") without requesting review. The watchdog auto-surfaced the stuck task at 18:15:54Z and moved it active→review; a CLI handoff was then requested.
- **Queued-message delivery kept failing.** Messages queued at 17:43:53Z, 17:53:57Z, 18:01:04Z and 18:06:12Z were delivered late or only after the turn was ended to force delivery (17:57:10Z, 18:31:00Z). One message queued at 19:24:49Z was flagged overdue at 21:07:42Z — still queued after 60 m; its eventual delivery is not recorded. CTO nudges were sent once (17:43:53Z) and held three times (17:48:53Z, 18:18:53Z, 19:03:53Z) while gates/validation ran.
- **Handoff failure #1 — worktree changed mid-gate** (18:35:44Z). The check result no longer described what was committed because new files appeared while the gate ran (`docs/phone-deploy.md`, `mobile/README.md`, the three scripts, both test files, the debug strings.xml). Nothing was lost; resolved by re-running handoff once the worktree was stable (requested again 18:49:53Z).
- **Handoff failure #2 — server-side finalization timed out** (19:19:54Z, deadline exceeded). The review itself completed anyway: pass 1 returned `good to go` at 19:24:48Z and the task moved to review at 19:16:45Z.
- **Watchdog restart** (18:59:55Z): engineer restarted after 10 m with no live process, between the first and second handoff attempts.
- **Two close-out gates.** The first completed at 00:47:38Z (712 s) without landing the task; why it didn't finish the close-out is not recorded. The second completed at 01:20:51Z (302 s) and the task went done a few seconds later.

## Learnings

- **Turn-ending to deliver a queued message defeats the handoff signal** — it happened three times here. The interaction between queued-message delivery and handoff detection belongs in the workflow rules; `docs/agent-workflow-rules.md` is where this pattern should be documented if it recurs.
- **A mid-gate worktree change invalidates the check result and fails handoff by design** (fail-closed, nothing lost). This is correct behaviour; worth keeping visible as the expected remedy is simply "re-run handoff when the worktree is stable".
- **Deploy-script privacy pattern:** config lives only on the machine (`REPOOS_HUB_*` env vars and `~/.config/repoos-hub/phone`); no default IP ever ships in the repo, and the script fails with setup instructions instead of guessing. This is now encoded in `docs/phone-deploy.md` and the script itself — no further doc move needed.
- **Fully qualified launch components matter with `applicationIdSuffix`:** a relative `.MainActivity` would resolve against the suffixed id. Guarded by `scripts/lib/launch-component.ts` with a test; the convention is captured in `docs/phone-deploy.md`.
- **Review-flagged hardening, unaddressed on this branch:** all `spawn()` wrappers listen only for `close`, not `error`, so a missing binary can hang instead of failing fast; and the no-nmap socket scan over 30k–49k ports is slow on a stale IP. If a future task touches this script, fold those in.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
