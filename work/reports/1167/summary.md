## TL;DR

A full QA pass over the macOS Hub app (task #1167) turned into five engineering rounds fixing real defects the sidebar-color fix (#1155) had not touched: registry writes caused by the QA process itself, stale reachability state leaking into every consumer of shared server state, lost Cmd-K search results, offline servers still contributing to badges, startup-learned identity not persisting, and a `ServerEntry` encoder that dropped `repositoryName`. After six review passes the verdict was `good to go` (with a stale-evidence caveat) and the branch merged as `599fd4818be1793f68c6e129f370046626b63085`, release:success. One irreversible mistake stands: early non-isolated QA launches wrote health timestamps into Nick's real Hub registry, and no pre-launch snapshot exists to restore from.

## Outcome

The Hub was built from main with `xcodebuild` and exercised end to end: sidebar in system dark and light, server rows, add-server-by-URL against a disposable loopback endpoint, edit/remove, Settings, the Cmd-K switcher, offline state after stopping a server-managed task preview, and quit/relaunch persistence. All screenshots were app-window-only (`screencapture -l<windowid>`) and visually inspected.

What shipped:

- **Sidebar subtitle correctness** — a server's repository name no longer replaces the saved URL; the row always shows the origin, with a regression test.
- **QA isolation** — `REPOOS_HUB_SUPPORT_DIRECTORY` lets QA runs point the app at a disposable registry; documented in `macos/README.md` (shell `HOME` was proven insufficient).
- **Reachability lifecycle** — web-view load failures classified as connectivity errors (offline/TLS/timeout) now trigger a health refresh, so Retry updates the sidebar's Offline state instead of only reloading the page; HTTP-status and blocked-navigation failures no longer mark a live server offline.
- **Startup health made volatile** — the launch-time health sweep keeps results in a separate volatile overlay instead of the registry document, so no unrelated later save (route visits, accent changes, pinning, reorder) can flush health or timestamps into `servers.json`.
- **Identity persistence** — display name, repository name and local project path learned from successful loopback health checks are persisted via an identity-only write, so Start/Stop local-server actions survive relaunch and edit; the fix included the missing `repositoryName` field in `ServerEntry`'s custom encoder, caught by a restart regression test.
- **Search and attention staleness** — cross-server search retains the active query across health changes, clears results on palette dismissal, and unhealthy servers are excluded from sidebar/tab/popover attention badges and the Dock badge total.
- **serve banner fix** — the auth-less `serve-noauth` banner now reports its effective loopback bind instead of a Tailnet address, with tests.

Final verdict: review pass 6 returned `good to go`, tagged STALE-EVIDENCE-ONLY (drawer captures were round-2 vintage; see Follow-ups). Close-out gate completed in 784 s and the task moved to done with release:success.

## Process stats

- **Created → done:** 2026-11-17T18:23:18Z → 2026-11-17T23:44:30Z, i.e. 5 h 21 m 12 s wall-clock.
- **Engineering rounds:** 5 (rounds 1–5), all one engineer agent (`codex`, model `gpt-6-luna`, single 300 s session, 90,305,252 tokens; cost not recorded). No restarts or model swaps of the engineer.
- **Review passes:** 6, all by the `reviewer` agent on `opencode-go/deepseek-v4.1-flash`. Passes 1–5: `needs some work`; pass 6: `good to go`.
- **Reviewer sessions (recorded):** 114,944 tokens / $0.04658205; 82,122 / $0.028768854; 91,832 / $0.03278082; 122,234 / $0.047580792; 59,821 / $0.038998374; 83,841 / $0.027094638 — a summed 554,794 tokens / $0.221805528 across the six passes. Session durations: 732 s, 222 s, 197 s, 605 s, 643 s, 360 s.
- **Tests at handoff:** native Hub suite 187 passed, 7 skipped; scoped `repoos check` passed with 123 changed-path test files (2,136 passed, 1 skipped) plus boot-timing tests, rendered contrast audit and UI smoke.

## What went wrong

- **Non-isolated QA launches wrote Nick's real registry (worst issue).** The first launch read the normal Application Support path because Foundation resolves home from the account record, not shell `HOME`: round 1 rewrote all 8 entries' `updatedAt` and added two `lastHealthAt` stamps; the round-2 launch stamped all 8 `lastHealthAt` and flipped five servers to `unreachable`. This violated the task's "never touch saved data" acceptance criterion. Resolution: never reversible — no pre-launch snapshot existed, and guessing timestamps risked further corruption; it is disclosed in the reports. Code-side prevention shipped: the support-directory override plus the volatile overlay design mean startup sweeps can no longer reach the persisted document.
- **First isolation fix was insufficient.** `persistToDisk: false` only skipped the immediate store write; the shared document was still mutated, so ordinary navigation saves flushed the health stamps (caught in pass 2). Fixed by moving startup health entirely out of the document.
- **Each round fixed one consumer and missed the next.** Pass 3 found the overlay resurrecting pre-edit names/state; pass 4 found only a docs drift; pass 5 found startup-learned identity never persisted (Start/Stop actions could vanish after relaunch), plus the missing encoder field. All fixed by round 5.
- **Two engineer turns ended without a handoff** (18:52 and 19:09), one exiting cleanly after the scoped check was still running. Queued-message delivery was repeatedly delayed (CTO nudges held because a message was already queued); one message sat undelivered past 60 m and was flagged overdue before delivery at 22:18.
- **Check flakes on the remote runner.** Final-check attempt 1 failed a rendered-contrast audit on Settings text in the `clear-light` scope that did not reproduce locally on the same tree (all 16 theme scopes passed locally); attempt 2 hit the known timing-sensitive `agent-review.test.ts` assertion (`expected 409, received 400`). Attempt 3 passed all gates with no source change between runs.
- **Round-4 test-fixture mistakes** (a Dock test with default-Unknown entries, an editor checker returning Offline for both phases) were caught by the failing native run and corrected; the rerun passed 187/7.
- **`just serve-noauth` bound wider than advertised** — Tailscale detection made it bind `0.0.0.0` despite the recipe's localhost claim; a direct `repoos serve` retry was refused by the managed-agent guard. Resolved by using the server-managed task preview, and the banner now reports the effective bind.
- **Stale evidence.** The final review approved on code soundness but noted the four attached drawer screenshots were round-2 captures showing behavior the branch had since changed, and that several exercised screens (light mode, add/edit/remove, Settings, ⌘K) had no attached capture — the round-1 PNGs stayed in `~/Library/Caches/RepoOS/task-1167-shots/` and were never attached.

## Learnings

- **A write-suppression flag does not make shared mutable state volatile.** If status data shares an object graph with the persisted document, any later ordinary save flushes it. Volatile state must live outside the document for its entire lifetime, and the regression test must include a subsequent unrelated save plus a fresh reload — a "did not save" assertion right after the sweep cannot catch the leak. (Candidates for a durable home: `docs/` macOS Hub notes or `docs/agent-workflow-rules.md` testing guidance.)
- **Health transitions must propagate to every dependent consumer** — sidebar, offline overlay, tab strip, context-menu local-service actions, cross-server search, attention counts and the Dock badge. The recurring review pattern (each round fixed one consumer, the reviewer found the next) is exactly what pass 6 flagged as worth a human's attention; it belongs in `docs/agent-debugging-and-incidents.md` as a worked example.
- **QA isolation must be established in the app's own path resolution**, not via shell environment conventions — documented with `REPOOS_HUB_SUPPORT_DIRECTORY` in `macos/README.md` (landed with this task).
- **Custom `Codable` implementations need encode/decode symmetry checks for every durable property**; a key + decoder with no encoder case is easy to overlook and only surfaced via a restart regression test.
- **Loopback-only claims need checking against the actual bind address** on hosts with Tailscale; the recipe log and the effective bind differed (fixed in code here).
- **Local-vs-remote audit divergence is an environment signal, not always a bug** — the runner-only contrast mismatch joins the flaky-check guidance in `docs/debugging-check-failures.md`.

## Follow-ups

None recorded (no linked tasks were filed from this task). Non-blocking reviewer suggestions from pass 6 remain unfiled: re-attaching HEAD captures for all exercised screens, clearing the removed server's volatile overlay in `deleteServer`, logging silent `try? store.save` identity failures, and the pre-existing `refreshHealth` index-captured-before-await race.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
