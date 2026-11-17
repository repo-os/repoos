## TL;DR

Releases gained a "what should happen when the AI draft is ready" chooser: **Publish automatically** or **Notify me**, plus a one-click **Generate notes and publish** button. The choice is a durable, server-owned promise that survives reload and restart, allows only one pending promise, is cancellable until the cut starts, and publishes through the exact same guarded path as the manual Publish button. Failures fail closed with a human-readable reason delivered in-app and via notification channels. After one engineering round and seven review passes (four fix-required verdicts, one timeout, one empty run, one `good to go`), the task was approved, merged (commit `8bd5eb8`) and marked done with `release:success`. The run was dominated by an infrastructure storm: a model-provider network outage that crashed the engineer repeatedly and forced one automatic model swap, plus a watchdog restart loop against a stale recorded engineer pid.

## Outcome

The feature shipped as designed:

- Clicking **Generate AI release notes** opens a shared Radix dialog (keyboard/touch usable, version and tag shown) offering **Publish automatically** and **Notify me**; closing it chooses nothing.
- Auto-publish reuses the manual Publish path — `beginRelease` was extracted so both the button and `startAutoReleaseCut` call it, inheriting every existing gate (clean main, branch, exact tag/version, checks) via `cutNewRelease`. Cheaper pre-checks in `maybeAutoPublish` yield readable blocker reasons.
- The promise is persisted in `release-auto-publish.json` (version, tag, mode, known issues, draft context key, full HEAD, state machine) — server-owned, one at a time, cancellable only before `publishing`, never silently retried. `resumeReleaseAutoPublish` handles restarts: waiting records recover only if the draft is on disk; a half-done `publishing` cut is failed with manual-check instructions, never replayed.
- Notify mode sends in-app attention items plus ntfy/Telegram notifications (release-specific formatting added) linking to `/releases?drawer=cut`.
- The default is remembered as `release.notesWhenReady` with a Settings control; CLI parity is recorded in `src/cli/api-route-parity.ts`; `docs/releases.md` and `user-docs/deployments-and-releases.md` updated. New test files cover both modes, cancel, failed drafts, mid-wait blockers and restart persistence.
- Final verdict: review pass 7 returned **good to go** (stale-evidence-only note on shots); status done, `release:success`, merged commit `8bd5eb821d0f927dec7008ab7ffef782872e73de`.

## Process stats

- **Wall clock:** created 2026-11-15T08:14:22Z, done 2026-11-17T10:47:57Z (≈2 days 2 h 34 m from those timestamps). Actual engineering began 2026-11-16T23:51:45Z (status ready→active), so active-to-done is ≈10 h 56 m.
- **Engineering rounds:** 1 recorded round (2026-11-17T03:37:32Z).
- **Review passes:** 7 — passes 1, 2, 4, 6 "needs some work"; pass 3 timed out; pass 5 produced no usable report; pass 7 "good to go". "Review-rounds-exhausted" was hit twice (08:08:58Z, 10:19:04Z) and cleared for review again by the human both times.
- **Agents and models:**
  - Engineer: started `opencode-go/deepseek-v4.1-flash`, automatically swapped to `opencode-go/glm-5.3-flash` after 3 crashes in 30 m (crash recovery, 01:18:50Z). No further swaps — recovery "surfaced instead of switching" when glm also crashed.
  - Reviewer: `opencode-go/deepseek-v4.1-flash` on all passes.
  - Debugger: 5 short `deepseek-v4.1-flash` sessions, all errored; routing sessions under `openrouter` (model not recorded).
- **Tokens and cost (recorded session rows only; sums are of those rows, nothing estimated):**
  - Engineer, deepseek: 136,583 tokens, $0.053982528 (session errored).
  - Engineer, glm: 3,286,554 tokens, $1.686933398 (finished).
  - Reviewer (6 rows with figures): 774,184 tokens, $0.305732994; two reviewer sessions errored with no token figures recorded.
  - Debugger sessions: no tokens/cost recorded (all errored).
  - Recorded total: 4,197,321 tokens, $2.04664892.

## What went wrong

- **Model-provider network outage (engineer):** from ~01:15Z, repeated `ConnectionRefused` failures reaching the model provider crashed the deepseek engineer 3 times (crash recovery counter 1/3→3/3), triggering the automatic swap to glm-5.3-flash. glm then crashed twice; recovery correctly refused to chain a second automatic switch and surfaced instead. Watchdog restarts at 01:33Z and 01:44Z got the engineer running again. Debugger sessions failed separately with `getaddrinfo ENOTFOUND opencode.ai`.
- **Watchdog restart loop:** between 00:30Z and 00:43Z the watchdog attempted ~20 restarts, each failing with "This worktree already has a recorded live engineer for task #1126 (pid 57100)" — a stale liveness record blocked active-without-engineer recovery. Resolved only when delivery/state settled (message delivered 00:48:52Z).
- **Orphaned processes:** an orphaned engineer (pid 47559) was stopped at 00:29:34Z; clusters of orphaned `sleep 60` run processes were stopped at 02:52Z and 07:54Z.
- **Message/nudge churn:** several CTO completion nudges queued but sat undelivered; three engineer turns ended cleanly without handoff (exit code 130, "ended to deliver a queued message"), and one ended with the draft report over the word limit until trimmed.
- **Handoff gate failures:** first handoff failed UI verification with HTTP 405 on `POST /api/release/notes` — the preview child is read-only, and the cut panel fires a `cachedOnly` draft lookup on open, so every panel capture recorded a failed request. Fixed by skipping the lookup during shot capture (`isShotPreviewCaptureActive`) with a component test. A second failure came from `fonts.googleapis.com`/`fonts.gstatic.com` console errors while the capture host was offline; the font CDNs were added to the gate's benign failed-resource list (with a lookalike-host negative test). One later capture failed outright ("browser capture cancelled", 06:46:50Z) and succeeded on retry.
- **Review findings (all fixed and verified in pass 7):** pass 1 — new attention kinds unregistered in the UI notice/notification registries, so failures reached no bell; pass 2 — the recorded-event allowlist in `attention-events.ts` dropped the new kinds after restart; pass 4 — records in `publishing` state could be overwritten to `ready`/`failed` by settle/fail paths (a live cut reported as "not published"); pass 6 — notify-mode drafts wrongly showed "Will publish vX when the notes are ready" copy.
- **Stale engineering report:** from pass 2 onward the round-1 report referenced tree `b99575e5` while reviewed HEAD moved; reviewers correctly treated it as non-evidence.
- **Flaky pre-existing test:** a full local run gave 7,948 passed / 1 failed — the pre-existing easter-eggs #1026 E2 test (asserts `resolveServeHost(undefined)` is `127.0.0.1`, true only without Tailscale). Not in this branch's diff.

## Learnings

- **Autonomous outward actions want "durable intent + shared guarded executor + fail closed."** Persisting the exact identity (version, tag, draft cache key) is what makes "never publish what the user did not opt into" enforceable, and refusing to cancel/replay mid-cut is a feature, not a limitation. Worth capturing in `docs/` (e.g. a note alongside `docs/releases.md` or an ADR if the pattern recurs).
- **Reuse the existing staleness definition.** Using `releaseNotesCacheKey(relevantShas, sinceTag)` instead of raw HEAD means bookkeeping churn can't cancel a valid publish while real code changes still do. Inventing a second identity per feature is a recurring hazard.
- **New attention kinds must be registered everywhere at once** — UI notice/notification registries *and* the recorded-event persistence allowlist. Pass 2's suggestion of a table-driven, single exported set plus a record→recreate→round-trip test deserves a durable home (test or `docs/`), since half-registration was caught twice in one task.
- **Shot-capture environment is hostile by design:** preview children are read-only, so any page that issues a non-user-initiated request on open will fail the gate during captures; gate benign-lists (font CDNs) exist for offline capture hosts. These belong in `docs/agent-ui-and-preview-conventions.md` if not already there.
- **Stale liveness records can deadlock watchdog recovery** (the pid-57100 loop). Worth an incident note in `docs/agent-debugging-and-incidents.md`.

## Follow-ups

None recorded in the task's Linked tasks. (The engineering report mentions filing #1143 for the Tailscale-sensitive `resolveServeHost` test failure, but the Linked-tasks record is empty — treat that reference as unverified rather than assuming the task exists.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
