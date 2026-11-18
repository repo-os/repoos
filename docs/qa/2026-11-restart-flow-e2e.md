# Update and restart flow end-to-end QA — 2026-11-19

## Result

The update notice and installed-version restart dialog were exercised in the
headless app at 1440px and 390px. The fixture matrix covered a hand-run server,
external systemd, external launchd, a RepoOS managed service, and uncertain
supervisor detection. Restart now, Restart when idle, cancellation, accepted
restart, and a failed restart response behaved as expected. Uncertain detection
showed the scoped manual command and no automatic restart controls.

The pass found two UI defects. The available-update notice had no component
styles and fell below the mobile tab bar, where it could not be tapped. The
mobile failure state also placed the error guidance beside the hand-run copy in
a narrow column. Both are fixed: the notice is now a body-level floating card
with safe clearance above mobile navigation, and restart errors take a full
row. A regression test checks those layout rules.

## What I drove

I ran `just serve-noauth 7296` from the detached scratch worktree at
`.repoos/qa-scratch-1196`, never from the main checkout or task worktree. The
server returned healthy `/api/health` and `/api/update-status` responses. A
headless Playwright run loaded this server's UI and intercepted only the
update/restart fixture endpoints; all other app traffic went to the auth-less
server. No visible browser was opened and no supervisor process or real server
restart was invoked.

For every state, I verified that the available-release banner opened the
upgrade details and that the installed-version notice matched the running and
installed versions. For hand-run, systemd, launchd, and RepoOS-managed states,
the script clicked Restart when idle, checked the waiting copy, cancelled, and
confirmed the actions returned. It then exercised Restart now: accepted
responses showed “Restarting…” for the supervised cases, and a simulated
service-manager failure produced visible guidance and a usable retry button
for the hand-run case. The uncertain state exposed
`repoos restart --root /fake/project --port 7123` and no restart buttons.

The initial phone-width capture showed the release notice below navigation.
The mobile tab control intercepted the attempted click, which reproduced the
layout problem rather than a fixture failure. After the fixed positioning and
mobile bottom inset were added, the click completed at 390px. Reviewing the
mobile failure capture found the second issue: the error paragraph shared a
flex row with the hand-run text. The updated full-row layout is visible in the
final capture and is asserted by the UI regression test.

## Scope and limits

The systemd, launchd, managed-service, uncertain, accepted-restart, and
failure outcomes above are fixture responses in the real app, not live service
operations. The launched process itself was a hand-run auth-less dev server;
it was used to serve the UI and confirm its health/status endpoints. The run
does not establish that this machine has working systemd or launchd
installation, permissions, or units, and it makes no claim about a real
restart/reconnect cycle. The code's existing server tests cover the path
classification and helper decisions; this pass adds UI coverage for the
visible flow.

## Evidence

- `src/ui-app/tests/releases.test.ts` — 45 tests passed, including the notice
  positioning and full-width failure guidance regression.
- Headless Playwright: all ten platform/viewport combinations passed. Captures
  are in the ignored `.repoos/qa-restart-1196/` folder for this worktree; no
  screenshot binaries are part of the docs change.
- `src/ui-app/tests/update-status.test.ts` — 15 tests passed.
