---
task: "1154"
pass: 6
at: "2026-11-17T18:38:16.579Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/update-restart-notice-don-t-suggest-a-la
state: ok
tree_identity: "66f5ab241:486592fc94"
---
## Verdict

`good to go` — STALE-EVIDENCE-ONLY: all five acceptance criteria are implemented; only the handoff capture is stale for HEAD.

## Relevance

`still relevant` — main still ships the dead `launchctl` hint and the CLI idle-check 401; this branch fixes both without touching #1091's managed path (`src/core/server-restart.ts` is unchanged).

## Evidence

None

## Bugs

None found

## Edge cases

Verified against the spec: the modal branches on `supervisorKind`/`supervised` so hand-run gets one pair of shared-dialog actions and no service command, `uncertain` gets a reason plus one `repoos restart --root … --port …`, and launchd/systemd show only the restart pair (no unsupervised duplicate). AC1's classifier and UI tests cover hand-run, launchd, systemd and managed. AC2 posts to the route, which spawns a detached `repoos restart --force --root … --port <bound>` helper (recorded serve flags + host + port), and reports helper spawn/exit failures plus a 30s reconnect fallback. AC3 pins the idle check to `127.0.0.1` and sends the mode-0600 loopback token; `--root` is threaded through config, locate, token and restart, and documented. `boundPort` plumbing keeps `servePort === 0` intact for schedule guards, with a source guard test. No new bare `node`/`npm`/`npx` invocations (only `node:` imports). The engineering report's source tree (`486592fc9`) predates HEAD (`55a8ef7c8`), so its claims were not treated as evidence; the only post-report change is the bound-port fix, which I read directly.

## Suggestions (non-blocking)

- Re-capture `Hand-run server restart notice` on `55a8ef7c8`; the PNG is from `486592fc9` and, though visually correct (proper single action pair, counts, no service command), it is formally stale.
- `ReleaseUpdateNotification.vue:186`: the 30s reconnect timeout is shorter than `DEFAULT_RESTART_WAIT_MS` (45s), so a genuinely slow restart can show a false "did not come back", and `restartError` is never cleared when a later poll succeeds.
- `restartFailure` is process-global and never expires, so one failed attempt keeps "Restart failed" in every window until another restart.
- Drop the unused `supervisorPlatform` field, and consider ignoring helper stdio (or a status file) to avoid EPIPE writes after the old server dies.
- `/api/health`'s recovery `restartCommand` still comes from the service registry and can print a registered-but-dead `launchctl` line (sibling surface, not this modal).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — zero console errors recorded; route matched, capture not blank.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T17:34:12.433Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

