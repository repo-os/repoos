## TL;DR

Task #1159 was a device-level QA pass of the Android Hub app (RepoOS Hub Dev, `org.repoos.mobile.dev`). The saved wireless ADB phone target refused connection throughout, so the pass ran on a Pixel 8 Android 16 (API 36) emulator instead. Every Hub screen was exercised with screenshots attached to the task: picker, Add server, edit/remove, Settings, all eight themes in light and dark, tailnet discovery (no-trusted-server state), opening a server and returning via the Android back gesture, and the lock screen in both failure and success paths. Two defects were fixed with regression tests: stale URL-validation text that did not clear on input, and rejected authentication dismissing the lock overlay; a review finding then extended the lock fix so a server-scope failure offers Cancel and a successful retry reopens the server that triggered the gate. A dark status-bar contrast defect was filed as #1166. The only acceptance gap is discovery against a reachable trusted RepoOS server, tracked in human task #1162. Merged as commit `643b4a581375aa3bc443f785d938841247ea4f79`; review verdict `good to go`; release succeeded.

## Outcome

The Android Hub Dev app was driven end to end on the emulator and every required screen was captured and inspected. Shipped fixes:

- **URL validation text did not clear on input** (`mobile/src/App.vue`, `mobile/src/form-validation.ts`): the missing-URL error was cleared on submit but not while the user typed; it now clears on non-blank input, with a regression test (`mobile-form-error.test.ts`) covering non-blank clears and whitespace-only retention.
- **Rejected authentication dismissed the lock overlay**, leaving the picker available (`mobile/src/components/LockOverlay.vue`, `mobile/src/lock.ts`, `mobile/src/lock-state.ts`): after review pass 1, a typed lock context (`mobile/src/lock-context.ts`) distinguishes the reopen gate from a pending server open. A server-scope rejection keeps the overlay visible and offers Cancel (back to the picker); a successful retry opens the same server the user tapped, via a testable replay helper. Tests cover rejection/success overlay states and that a successful retry returns the original pending server while reopen contexts do not.
- **Filed #1166** for Android 16 status icons rendered white against a light status-bar strip in dark themes, with the emulator screenshot attached; the experimental WebView status-bar overlay that caused a Capacitor safe-area injection error was reverted.

Final verdict: review pass 2 returned **good to go** (evidence-gap-only), close-out completed, task status done with `release:success`. All native evidence is from the emulator, not the phone; live trusted tailnet discovery remains unverified and is deliberately not claimed.

## Process stats

- **Dev rounds:** 2 engineering rounds (round 1 at 2026-11-17T18:18:42Z, round 2 at 2026-11-17T19:56:09Z), both by the `codex` engineer on model `gpt-6-luna`.
- **Review passes:** 2 (pass 1 "needs some work" at 18:24:30Z, pass 2 "good to go" at 20:04:24Z), both by the `reviewer` agent on `opencode-go/deepseek-v4.1-flash`.
- **Wall-clock, created → done:** 2026-11-17T15:51:18Z → 2026-11-17T20:35:21Z = 4 h 44 min 3 s.
- **Engineer sessions (as recorded):** two rows, both started 2026-11-17T15:51:44.985Z, model `gpt-6-luna` — 731 s / 7,177,214 tokens and 4,989 s / 49,090,396 tokens; total tokens recorded 56,267,610; cost not recorded.
- **Reviewer sessions:** 344 s / 71,896 tokens / $0.021878406 and 489 s / 94,859 tokens / $0.033574452; combined 166,755 tokens / $0.055452858 (sums derived from the recorded per-session figures).
- **Restarts/swaps:** no model swaps; watchdog/CTO interventions: watchdog auto-resume resume 1/3 (16:23:57Z), watchdog auto-surface to ready (16:28:58Z), CTO restart-stalled-agent fresh (17:17:50Z), watchdog auto-resumes resume 1/3 (17:28:58Z) and resume 2/3 (17:40:28Z), watchdog restart for a queued message waiting 3 m with no live process (19:27:26Z). No agent/model role changes.

## What went wrong

- **Saved phone target unreachable all day.** The wireless ADB endpoint in `~/.config/repoos-hub/phone` refused connection; `adb devices` showed no device. The first several engineer turns (16:02Z, 16:14Z, 16:18Z, 17:12Z, 17:21Z, 17:23Z, 17:35Z) ended without a handoff, each reporting the device pass as blocked. Resolved after the task notes were updated to authorize the emulator: a `tuk-pixel` Pixel 8 AVD was found via `avdmanager` even though the `emulator` binary was not on `PATH`, and the pass ran on it.
- **Watchdog/CTO churn while blocked.** Repeated clean exits without a handoff signal triggered watchdog auto-resumes, an auto-surface to `ready`, and a fresh CTO restart before the emulator path unblocked the work.
- **Review pass 1 findings (18:24Z):** (a) the lock gate lost context — with lock scope `server`, a rejected authentication left an uncancellable overlay and a later success closed it without opening the tapped server; (b) `mobile/src/App.vue` conflicted with main's dev-update edits. Both addressed in round 2: the lock context/Cancel/retry design above, and a merge of main keeping both sides.
- **Handoff failed at the check gate (18:46:04Z)** — `check-fmt:check` formatting failure; fixed by running the formatter and re-requesting. A handoff was also **deferred at 19:54:46Z** because a queued message had to be read first; it was delivered and the next handoff succeeded (19:56:09Z).
- **Runtime/tooling noise in engineer stderr:** Codex `codex_core` errors about missing tool-call outputs and a failed rollout-item recording; a failed file write to `LockOverlay.vue` (exit 1) and an image-not-found for `lock-fail-closed-final.png` during QA capture — all recovered within the turns, no lasting damage.
- **Status-bar overlay experiment:** enabling WebView overlay mode to fix dark status-bar contrast caused a Capacitor safe-area injection error and a blank app view; reverted and the defect filed as #1166 instead.
- **Logcat `Renderer process crash detected (code -1)`** appeared while tearing down the in-app browser after the back gesture; assessed as teardown noise, not a user-visible crash (the app returned to the picker correctly).

## Learnings

- A configured AVD can rescue a blocked device QA pass even when the `emulator` executable is missing from `PATH` — `avdmanager list avd` plus the installed SDK image is the way to find it. Worth a line in `docs/agent-workflow-rules.md` or the mobile QA docs.
- An authentication rejection must leave protected UI covered while still exposing an explicit retry; retry should replay the operation that triggered the gate only on success. Durable UX rule — candidate for `docs/mobile-architecture.md` or `user-docs/android-hub.md`.
- Android 16's enforced edge-to-edge behavior ignores app-driven status-bar background colors for target SDK 36; theme contrast must be verified against the actual target SDK, not inferred from CSS. Belongs in `docs/mobile-architecture.md` (and is carried concretely by #1166).
- Platform-specific dependencies constrain test layer choice: the root web test environment cannot resolve `@capacitor/app`, which exists only in the mobile app's dependencies, so `App.vue` wiring was covered via a pure helper test instead of a component mount. Worth recording in the mobile testing notes.
- Synthetic app-local preferences can drive presentation and navigation states for QA, but they prove nothing about connectivity, tailnet results or sign-in; likewise an empty discovery screen only proves the UI renders. QA evidence claims should state which external behaviors remain unproven.

## Follow-ups

- **#1162** — human-assigned, depends on #1159: complete the live tailnet discovery check with a reachable trusted RepoOS server (dev.repoos.org was unreachable), then close this QA task's last gap. Note the board records `1159 depends_on 1162` (the reviewer flagged that this task's report had the dependency direction inverted).
- **#1166** — fix Android 16 Hub status-bar contrast (dark themes render white status icons on a light strip), filed during this pass with the emulator screenshot attached.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
