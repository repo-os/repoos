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

Task 1131 reworked the RepoOS Hub mobile server picker based on Nick's feedback after testing the #1127 build on his Nothing Phone (3a). The Edit/Done reorder toggle is gone — rows are now reordered by long-press-and-drag with haptics (350 ms hold, live reordering, persisted on drop). "Find servers on my tailnet" moved from the list header into the bottom action area above "Add server", and remains available in the empty state. Discovery against a server too old to have `GET /api/servers/tailnet` (like bee on v0.5.83) now shows a plain message naming the server and offering manual add, instead of "The server sent an unexpected reply." An unrelated but blocking fix rode along: a backtracking regex in the shared test harness stalled every vitest run. One review pass returned "good to go" (evidence-gap-only); the task merged cleanly as `cc01d288ca54a34f5e79bcbffabb1a7456caddff` and was released successfully.

## Outcome

Shipped, per the merged branch:

- **Hold-to-drag reordering** in `mobile/src/components/ServerListView.vue`. HTML5 `draggable` never worked on touch, so it was replaced with pointer events: a 350 ms hold lifts a row (with haptics and a lifted-row look), movement past ~10 px before the hold cancels so scrolling never triggers a drag, `document.elementFromPoint` reorders live during the drag, and the persisted order changes only on drop via the same `reorder(id, toIndex)` event as before. Tapping a row still opens the server; the ⋮ menu still edits/deletes; dragging near a list edge auto-scrolls. No Edit button remains.
- **Bottom action area**: the header toolbar is gone (top bar is brand + Settings only); "Find servers on my tailnet" is a secondary ghost button stacked above the primary "Add server" in a `.picker-actions` footer, used by both the list and the empty state. Stacked full-width buttons won over side-by-side at 412 px because the discovery label is long.
- **Older-server message**: `fetchTailnetServers` returns an `outdated` result for a 404 or a non-JSON reply (HTML page, SPA fallback, JSON array), rendering "`<server>` is running an older RepoOS that can't list tailnet servers yet. Update RepoOS on that machine, or add servers by URL." The discovery view shows an "Add server by URL" button whenever it has no result rows. "Unexpected reply" is gone.
- **Test-harness fix** (`src/ui-app/tests/helpers.ts`): the global setup's orphan sweep ran `command.matchAll` with an ambiguous slash-segment regex over `ps` lines; agent command lines embed the whole prompt (~48 KB), causing exponential backtracking that hung vitest on Node before the first test file. The regex was fixed and a regression test added.
- Component tests cover the new gestures and bottom actions (`src/ui-app/tests/mobile-server-list.test.ts`, new); `mobile-tailnet-discovery.test.ts` gains 404 and non-JSON cases. Docs updated in `docs/mobile-architecture.md` and `mobile/README.md`. `just build-android` passed (7.1 MB debug APK).

**Final verdict: good to go** (review pass 1, `EVIDENCE-GAP-ONLY` — no Hub preview shots, expected for mobile-only work). The human step — a quick feel check of haptics and hold timing on Nick's phone — remains outstanding and was never claimable by an agent.

## Process stats

- **Created → done**: 2026-11-15T14:39:13Z → 2026-11-15T16:57:37Z, i.e. 2 h 18 min 24 s wall-clock, including a 233 s close-out gate.
- **Engineering rounds**: one recorded engineering round (Round 1, finalized at 16:50:15Z). The single engineer session spanned 7049 s (~1 h 57 m) from 14:39:38Z, but it was interrupted repeatedly (see below), so it is best described as one long session with several ended turns, not multiple dev rounds.
- **Review rounds**: 1 pass — verdict "good to go" at 2026-11-15T16:51:17Z (reviewer session elapsed 59 s).
- **Agents and models**:
- Engineer: agent `engineer`, model `opencode-go/deepseek-v4.1-flash`. Tokens 345,490; cost $0.175574064; status finished.
- Reviewer: agent `reviewer`, model `composer-2.5`. Tokens and cost not recorded.
- Model router (openrouter): two routing sessions, both ~instant (1 s and 0 s), model unknown.
- **Restarts**: the watchdog restarted the engineer twice (15:59:55Z and 16:13:40Z), both times because a queued message waited 3 m with no live process.
- **Merge**: `cc01d288ca54a34f5e79bcbffabb1a7456caddff`; close-out ended with `release:success`.

## What went wrong

- **Vitest hung before its first file.** The scoped `repoos check` spun at ~95% CPU for minutes. Neither the runtime nor the new component was the cause: the test harness's global orphan sweep matched a slash-heavy regex against `ps` lines, and agent command lines embed the whole prompt, so the regex backtracked exponentially (Bun tolerated it; Node did not). Diagnosed by sampling (`RegExpStringIteratorPrototypeNext` in a microtask). Fixed by excluding `/` from the segment class, extracting `runRootsInCommand`, and adding a regression test with a 4 KB slash-heavy command.
- **Tests skipped by the runner environment.** `repoos check` passed but its test step was skipped (`REPOOS_SKIP_TESTS=1`). The engineer noticed and ran the affected suites directly against the repo vitest config (`mobile-server-list`, `mobile-tailnet-discovery`, `mobile-hub-shell`, `reap-fixtures`) — all green. This also triggered the harness fix above.
- **Four engineer turns ended without a handoff** (15:34:25Z, 16:37:46Z, 16:42:16Z, 16:47:16Z), each exiting cleanly with exit code 130 specifically to deliver a queued message. Three of these were re-triggered by the same pattern: a message queued while the handoff gate was running or mid-work, then a 3–4 m undelivered wait with no output ending the turn.
- **Watchdog restarts (2).** At 15:59:55Z and 16:13:40Z the watchdog restarted the engineer because a queued message waited 3 m with no live process. Both times the message was delivered within minutes of the restart (16:03:30Z and 16:13:41Z).
- **CTO nudges held work four times** before it could proceed: once for machine pressure (CPU idle 0%, below the 5% floor; system load 4.4× per CPU against a 3× limit), once because a handoff gate was running, and twice because an undelivered message was already queued. Three completion reminders were sent after 5 m without worktree activity (16:33:18Z, 16:39:07Z, 16:44:07Z).
- **No shots could be declared.** No mobile Hub preview target is registered in this repo (the `repoos-mobile-dev` target referenced by an older test was never added to `repoos.toml`, and task branches must not edit it). A `default` shot would have captured Mission Control, not the picker, so the handoff declared `shots: skipped` rather than submit misleading evidence. Handoff screenshots therefore show the desktop app; this is an evidence gap, not a missing change.
- **Task body flagged underspecified** at handoff: missing section "Notes for AI" (recorded as a note; non-blocking).

## Learnings

- **Long-press drag is gesture arbitration, not a gesture.** The hold declares "the user is not scrolling", and a non-passive `touchmove` listener added only at that moment keeps the pan from starting. Resetting the movement threshold and click-suppression window on every `pointerdown` is what keeps a quick follow-up tap working. Durable in the code and tests; the gesture-arbitration principle is documented in `mobile/README.md`.
- **Keep dragged order local; persist once on drop.** Emitting `reorder` per crossing couples the visual index to async writes. Worth a line in `docs/mobile-architecture.md` if not already implied there.
- **Regexes over `ps` output are unbounded-input problems.** `ps` lines are arbitrary agent prompts; anchor path segments on the separator or CI hangs before a test runs. This is a harness-level hazard worth carrying into `AGENTS.md` (test-infrastructure rules) and/or `docs/agent-debugging-and-incidents.md` as a worked example — it produced a machine-wide stall, not a test failure.
- **Error messages should name the server and offer the manual path.** "The server answered 404" is a support question; "this server is too old, update it or add by URL" is an answer. The `outdated` result kind in `mobile/src/tailnet.ts` keeps the wording testable and carries the server name — a pattern worth generalizing in future mobile error handling.
- **Skipped ≠ passed.** A green `repoos check` with `REPOOS_SKIP_TESTS=1` in the runner environment means the affected suites must be run directly. Engineers should treat a skipped test step as an explicit verification obligation, not a pass.

## Follow-ups

None recorded — no tasks were filed from this task's linked tasks.

Two suggestions from review remain unfiled and are noted here for whoever picks them up: a human device pass for haptics/hold timing on Nick's Nothing Phone, and optionally narrowing the `outdated` mapping if a newer API ever returns structured error JSON at 200.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
