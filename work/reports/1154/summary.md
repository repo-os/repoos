## TL;DR

Task #1154 fixed the post-update notice for a hand-run server: instead of a bogus `launchctl kickstart` command for a service that does not exist, the modal now identifies a hand-run server plainly and offers a **Restart now** button that starts a detached `repoos restart` helper (recording serve flags, host, bound port and explicit `--root`). The helper's spawn and exit failures are surfaced to the UI instead of leaving it stuck on "Restarting…", idle-waiting is shared by supervised and hand-run paths, and uncertain supervisor detection gets a reason plus a single scoped CLI fallback. The separate `repoos restart` HTTP 401 was fixed by sending the server's existing mode-0600 loopback-only local token, pinned to `127.0.0.1`. It took 4 engineering rounds and 6 review passes (one reviewer timeout, one human intervention after review rounds were exhausted) to reach `good to go`; the task closed as done with release success.

## Outcome

What shipped:

- The installed-update modal never shows a `launchctl`/`systemctl` command for a service that is not installed. A hand-run server gets a plain explanation plus **Restart now** / **Restart when idle** built from the shared dialog components, showing how many agents and checks will be interrupted and that agents resume after the replacement server starts. Supervised (launchd/systemd) servers keep their existing restart pair; #1091's managed-service restart path is unchanged (`src/core/server-restart.ts` untouched).
- The hand-run restart is performed by a detached CLI helper started by the server, which runs `repoos restart --force --root <serving checkout> --port <bound port>`; the server cannot kill itself and then relaunch itself. The helper waits for the child's `spawn` event, captures bounded output, and reports non-zero exits and refusals through update status so the UI can clear its busy state and show one fallback command. Missing port information fails closed; uncertain supervisor detection is refused with an explanation rather than a promised restart. A 30s UI reconnect fallback covers the case where the old server dies before it can report failure.
- `repoos restart` now authenticates its idle-status request with the server's local CLI token over `127.0.0.1` only, fixing the HTTP 401 for terminals and same-machine agents; it also accepts `--root` so a server started from a linked worktree targets its own lock instead of the board root.
- Docs updated: `user-docs/cli.md`, `user-docs/getting-started.md`, and a stale line in `docs/architecture.md` that recommended plain `repoos serve` for hand-run restarts.

Final verdict: review pass 6 returned `good to go` (marked STALE-EVIDENCE-ONLY — all five acceptance criteria implemented, only the handoff screenshot predated final HEAD); the task closed `done` with `release:success`, merged as commit `11f50910bc51f78422d2a555d2beccca22b8f7c2`.

## Process stats

- Wall clock, created → done: 2026-11-17T13:30:27Z → 19:06:38Z (5h 36m 11s). Active → done (branch created 14:36:10Z): 4h 30m 28s.
- Engineering rounds: 4, all by the same engineer agent (codex, model gpt-6-luna; no swaps or restarts). Its single session ran 6,731s (1h 52m 11s) with 315,842,610 tokens; cost not recorded.
- Review passes: 6, all by reviewer agent "reviewer" on opencode-go/deepseek-v4.1-flash. Passes 1–4: `needs some work`; pass 5: timed out after 15 minutes, no report; pass 6: `good to go`. Reviewer sessions totaled 672,499 tokens and $0.22369326 combined cost (sum of the six recorded session costs: $0.029396634, $0.049691568, $0.040775022, $0.038125026, $0.031076712, $0.034628298); per-session elapsed ranged 247s–900s. No reviewer model swaps.
- Close-out gate: completed in 1045s.
- Total tokens across recorded sessions: 316,515,109 (engineer + reviewer). Routing sessions (openrouter model router) recorded no tokens or cost.

## What went wrong

- **The reported bugs themselves.** The modal suggested `launchctl kickstart … com.repoos.serve.repoos-c4114ede` for a launchd service that did not exist (the server was hand-run with `just serve`), and `repoos restart` failed with "Could not confirm the server is idle: server returned HTTP 401". Both fixed as described above.
- **Round 1 scoped check failed** on two tests asserting the removed behavior (copying a manual restart string for unsupervised servers; HTTP 409 when no supervisor detected). Rewrote the assertions; subsequent scoped checks passed.
- **Codex `apply_patch` errors** appeared in the engineer's stderr during round 3 work (failed to find expected lines in `src/server/routes/info.ts`). At 16:11:27Z the engineer's turn ended without a handoff — deliberately, to let a queued message be delivered; work resumed on the same worktree.
- **UI verification failure at 16:46:18Z:** the declared shot captured a "Loading…" state on `/` because the unrelated dashboard decision-digest request was still in flight. Fixed by seeding a neutral empty digest response for the two restart-notice fixtures; the next verification passed.
- **Flaky scoped-check test:** round 2's scoped run failed twice on the same unrelated race in `agent-review.test.ts` — the fixture's review was auto-bounced from `review` to `active` before its assertion. Isolated run passed; the fixture now reports `needs rescoping` so it stays in `review` deterministically.
- **Review pass 5 timed out** after 15 minutes with no report (state failed); it retried automatically and pass 6 succeeded. Reviewer rounds were then exhausted (`needs_input: review-rounds-exhausted` at 17:34:19Z); a human cleared it for review again at 18:18:57Z, enabling the successful pass 6.
- **Queued-message friction:** a message queued at 17:34:19Z was never delivered — flagged overdue at 18:43:24Z and finally dropped at 19:05:56Z because the task was done. Several CTO nudges were held earlier because the handoff gate was running or a message was already queued.
- **Stale handoff evidence:** passes 4 and 6 noted the declared screenshot was captured from an older tree than HEAD. Pass 6 judged it visually correct and approved anyway; no re-capture is recorded.

## Learnings

- **A child process spawning is not a restart succeeding.** `spawn` only proves the executable started; a later ENOENT refusal, non-zero exit, or a replacement server that never comes up must reach the person who clicked the button. Accept-then-report failure semantics (bounded output capture, update-status publication, UI reconnect timeout) are the pattern for any self-restarting server. Worth a durable home in `docs/agent-debugging-and-incidents.md`.
- **Identity of a RepoOS server = serving checkout + actual bound port.** Defaults that point at the board root pick the wrong lock when a linked worktree serves the app (`--root` exists for this), and `--port 0` must filter by the *bound* ephemeral port, never omit the filter. Relatedly, don't overload an existing field's sentinel semantics: passing the bound port as `servePort` would have silently disabled the `servePort === 0` schedule guard; a separate `boundPort` preserved it — a candidate note for `docs/architecture.md`.
- **Local CLI credentials stay on loopback.** The mode-0600 local token is the intended mechanism for browser-less local commands; any new CLI call to a protected local API must read and send it pinned to `127.0.0.1` rather than weakening route auth — candidate for `docs/` (auth docs) if not already covered.
- **Test-design lessons:** isolate HTTP-contract tests from OS-spawn tests via a narrow helper seam; assert exact counts and states of dialog controls (`.find()` hides duplicates); make lifecycle-state fixtures deterministic instead of racing automatic transitions; and neutralize unrelated in-flight requests in screenshot-state fixtures so declared shots are deterministic.

## Follow-ups

None — no linked tasks recorded. Non-blocking reviewer suggestions that were never filed as tasks remain in the review passes: the 30s reconnect timeout is shorter than `DEFAULT_RESTART_WAIT_MS` (45s) so a slow restart can show a false "did not come back"; `restartError` is never cleared on a later successful poll and `restartFailure` is process-global and never expires; the piped helper stdio can hit EPIPE after the old server dies; the unused `supervisorPlatform` field; and the sibling `/api/health` recovery banner can still print a registered-but-dead `launchctl` line from the service registry.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
