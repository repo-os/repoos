---
task: "1154"
pass: 3
at: "2026-11-17T17:03:38.740Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/update-restart-notice-don-t-suggest-a-la
state: ok
tree_identity: "99142541d:99142541dd"
---
## Verdict
`needs some work` — a hand-run server renders two copies of the restart controls (visible in the shot), and the new status poll blocks on supervisor detection.

## Relevance
`still relevant` — the bogus launchd command and the CLI 401 still exist on main; this branch targets both directly.

## Evidence
None

## Bugs
- **Class: conditional-render fallback** — `ReleaseUpdateNotification.vue:338-390`: the new `v-else` group hangs off the `uncertain` check instead of `supervised`, so a hand-run server renders the generic Restart now / Restart when idle pair *and* the `.release-update-manual` block with a second pair — four controls, and the declared shot shows the resulting broken flex/grid layout. While a hand-run idle wait is pending, the manual pair stays enabled and offers no Cancel. Gate the generic group on `supervised` and let the manual block add only the explanation.
- **Class: cache bypass** — `info.ts:283` calls `detectSupervisor(process.pid)` outside the 10s `supervisedCache`. `/api/update-status` is polled every 3s by this app-wide component and every 1s by the `whenIdle` timer, and each call runs synchronous `launchctl list`/`ps`/`launchctl print` (or `systemctl`) on the request thread. Cache `kind`/`reason` beside `value`.
- **Class: test coverage** — `releases.test.ts:742` uses `.find()`, so duplicate controls pass; no dialog test covers launchd/systemd supervisors (AC1 covers them only at the `isRestartSupervised` classifier level); nothing asserts `repoos restart` sends `x-repoos-local-token` or honours `--root` (AC3's 401 fix).
- **Class: docs/code mismatch** — the modal and 503 copy print `repoos restart --root <path> --port <n>`, but `user-docs/cli.md:574` and `src/cli/help.ts:423` document no `--root`.

No further findings of this class were found after grepping: info.ts, ReleaseUpdateNotification.vue, DecisionDigestPanel.vue, releases/update-status/agent-review tests, types.ts, server.ts, server-restart.ts, local-token.ts, service-manager.ts, help.ts, cli.md, getting-started.md, architecture.md.

## Edge cases
- The detached helper keeps piped stdout/stderr whose reader is the server it kills; later writes can hit EPIPE. Use a log/status file or ignore stdio.
- `restartFailure` is module-global and never expires, and the UI never clears `restartError` when a later poll returns null, so one failure leaves a stale "Restart failed" in every window.
- `/api/health` (`info.ts:185`) still builds `restartCommand` from the service registry without checking the unit is live, so the recovery banner can print a dead `launchctl` line (sibling surface).
- `--root --port 1234` silently takes `--port` as the root path.
- Report source `99142541` matches HEAD `f0a3333` apart from round-3 bookkeeping.

## Suggestions
- Drop the now-unread `manualCommand` from `releases.test.ts` fixtures and revert the unrelated `## Relevance` addition in `agent-review.test.ts`.
- Give the 401 case a specific message about the local CLI token instead of the generic idle-check failure.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T16:58:02.133Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

