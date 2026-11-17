---
task: "1153"
pass: 6
at: "2026-11-17T17:03:31.587Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-find-servers-on-my-tailnet-stop-list
state: ok
tree_identity: "e1b1e6936:867c4d3466"
---
Repeated review classes: earlier passes flagged hard-coded probe port, per-project URL mapping, shared result shape, saved-state reconciliation, conditional rendering, HTTP/SSH fallback, timeout budget, config-key enforcement, the tailnet-only access gate, docs/behaviour drift, and a merge conflict. All are fixed at HEAD with tests, including pass 5's `root`/`allowlistGroup` payload regression — except the docs-drift class, which has one new instance (below). A human should watch that recurring pattern.

## Verdict
`good to go` — STALE-EVIDENCE-ONLY: the payload blocker is fixed and tested; only the handoff capture is stale and on the wrong surface.

## Relevance
`still relevant` — `main` has no machine-level listener; #1140/#1144 only fixed adjacent discovery pieces.

## Evidence
- `default-1.png` (`auto: matched src/ui-app/**`, route `/`): captured on tree `867c4d346`, reviewed HEAD `e1b1e693`; renders desktop Mission Control, not the changed mobile Hub, and shows a "repo server at 127.0.0.1:41179 is not responding" banner. No console errors recorded.

## Bugs
None found
No further findings of this class were found after grepping: `src/core/tailnet-servers.ts` HTTP/SSH branches and reason mapping, `src/server/routes/servers.ts` gate/listener handler/local rows, `src/server/tailnet-discovery-listener.ts` bind/retry/teardown, `src/server/server.ts` registration/refresh/close and `PUBLIC_PATHS`, `src/core/server-registry.ts`, `src/core/config.ts` schema, `src/commands/servers.ts`, `allowlist-group-sync.ts`/`budget-allowlist-groups.ts`, `mobile/src/{tailnet,reachability,app-state}.ts`, `TailnetDiscoveryView.vue`, palette/vector registrations, tests and docs.

## Edge cases
- The listener answers `disabled: true` whenever no valid rows remain, so a machine whose only project is stale or opted out is reported as "tailnet discovery is turned off on this machine" — a fabricated reason.
- A reachable project with no `tailscale serve` mapping arrives without `url`, so Hub shows "No URL advertised"; the SSH path would show "Needs HTTPS".
- The listener binds only at startup; Tailscale coming up later leaves the machine unprobeable until restart.
- Engineering report is stale: source tree `867c4d346`/`0c2ab37e` ≠ HEAD `e1b1e693`, and its claim that the payload omits `root`/`allowlistGroup` is no longer true; no current-round report exists.

## Suggestions (non-blocking)
- Fix `docs/server-registry.md:107-108` ("they do not expose project paths"): the restored `root` field (needed for allowlist apply) is now in the payload.
- Re-capture with a declared mobile-Hub discovery shot (`discover` plus a failures fixture) on the final tree; the desktop `/` capture adds no coverage.
- Drop the now-unused `originOf` export.
- Distinguish "no projects running" from an explicit opt-out in the disabled response.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T15:11:53.940Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

