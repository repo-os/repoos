---
task: "1154"
pass: 1
at: "2026-11-17T15:06:52.193Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/update-restart-notice-don-t-suggest-a-la
state: ok
tree_identity: "f37959a79:8113097506"
---
## Verdict
`needs some work` — hand-run restart is sound, but AC1 test coverage is missing, spawn failures are swallowed, and the 401 fix sends the local token to non-loopback hosts.

## Relevance
`still relevant` — the dashboard still needed a real hand-run restart action and the CLI 401 is real.

## Evidence
None

## Bugs
- **Class: test coverage** — AC1 demands tests for hand-run, launchd-managed and systemd-managed servers; `src/ui-app/tests/update-status.test.ts` now tests only hand-run helper construction, and the supervised `POST /api/update-status/restart` path lost its only route test (grep finds no other caller test). Add managed/external `detectSupervisor` cases and a supervised route assertion; the 202/503 branches are also untested.
- **Class: unhandled spawn errors** — `src/server/routes/info.ts` `spawnHandRunRestartHelper` attaches `helper.on("error", () => {})` and returns `ok: true` before the spawn outcome is known, so ENOENT/EACCES on the resolved binary is invisible: the route answers 202, the UI waits, and AC4's "say why and show one command" never happens. Log the error and surface a failure path (the sibling `spawnHandRunServe` at least logs under `REPOOS_DEBUG`).
- **Class: credential scoping** — `src/commands/restart.ts` sends the mode-0600 local token to `server.host`, which `locateRepoServer` can return as an explicit LAN/tailscale address. The middleware only accepts loopback (`src/server/local-token.ts`), so those servers still get HTTP 401, and the token is sent over a non-loopback interface. `RepoOsApi` and `shot` both pin `127.0.0.1`; use that here too.

No further findings of this class were found after grepping: `src/server/local-token.ts`, `src/cli/repoos-api.ts`, `src/commands/shot.ts`, `src/core/server-restart.ts`, `src/core/server-locate.ts`, `src/ui-app/tests/releases.test.ts`.

## Edge cases
- Double-click "Restart now": the button re-enables as soon as the 202 lands, so a second helper can stop the freshly restarted server.
- `ctx.servePort` can be `0`/undefined, so no `--port` filter reaches `repoos restart`; with multiple servers this can target the wrong one.
- A managed unit detected but not running reports `supervised: true`; the 202 no-op there predates this diff but is now hidden behind "Restart now".

## Suggestions
- The handoff shot is the plain dashboard at `/`; the changed hand-run modal is not captured even though `?shotState=release:restartPendingLight` exists. Re-capture that state for the human.
- Drop the now-dead `copyRestartCommand`/`manualCommand` UI path and merge the two `../core/config.js` imports.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T15:02:06.741Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

