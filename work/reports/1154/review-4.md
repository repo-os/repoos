---
task: "1154"
pass: 4
at: "2026-11-17T17:32:21.746Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/update-restart-notice-don-t-suggest-a-la
state: ok
tree_identity: "486592fc9:99142541dd"
---
## Verdict
`needs some work` — the bound-port change silently disables the ephemeral-port schedule guard; the handoff shot is also stale for HEAD.

## Relevance
`still relevant` — main still shows the dead `launchctl` line and the CLI 401; this branch targets both.

## Evidence
None

## Bugs
- **Class: sentinel semantics / guard bypass** — `src/server/server.ts:4682` now passes `boundServePort` as `RouteContext.servePort`, but `scheduleHostileReason` (`src/server/schedule-automation.ts:27`) uses `servePort === 0` as the "ephemeral harness, never run schedules" sentinel. On a `repoos serve --port 0` server, `POST /api/schedules/:id/run` (`src/server/routes/schedules.ts:91`) is no longer refused with `ephemeral-port`, while the same server still refuses the automatic tick (`server.ts:3247`, `requestedPort`) — so Run now is allowed where the guard says "must never run". Instances: (1) the schedules route, now reads the real port; (2) the Telegram synthetic context (`server.ts:5205`) still passes `requestedPort`, so the same route answers differently by transport; (3) the tick/reminder paths still pass `requestedPort`. Keep `servePort`'s requested-port contract (or add a separate bound port/`req.socket.localPort`) instead of overloading the field.

No further findings of this class were found after grepping: `server.ts` (`requestedPort`, `boundServePort`, `telegramRouteContext`, reload), `routes/schedules.ts`, `schedule-automation.ts`, `reminder-tick.ts`, `server-registry.ts`, `routes/types.ts`, `routes/info.ts`.

## Edge cases
- Piped helper stdio can hit EPIPE once the old server (its reader) exits; harmless in the success path but noisy.
- `restartFailure` is module-global and never expires; the UI never clears `restartError` when it returns null, so one failure lingers in every window.
- `--root --port 1234` still takes `--port` as the root path (unchanged, malformed-input).
- `/api/health`'s `restartCommand` (`service-manager.ts:160`) can still print a dead `launchctl` line to the recovery banner — same class, sibling surface, unchanged from pass 3.
- No engineering report covers reviewed HEAD `486592fc9` (round 3 describes `99142541d`); claims treated as evidence for neither.

## Suggestions
- Re-capture `Hand-run server restart notice` on HEAD: the PNG is from `99142541dd` and still shows the duplicate four-control layout fixed in `486592fc9`.
- Give the 401 idle-check failure its own message about the local CLI token.
- Drop the unused `supervisorPlatform`, and clear the stale `restartError` when `restartFailure` clears.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T16:58:02.133Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

