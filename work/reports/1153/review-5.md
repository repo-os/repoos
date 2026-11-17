---
task: "1153"
pass: 5
at: "2026-11-17T15:20:38.265Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-find-servers-on-my-tailnet-stop-list
state: ok
tree_identity: "0ff8fa8c4:867c4d3466"
---
## Verdict
`needs some work` — the narrowed peer discovery payload drops `allowlistGroup`/`root`, breaking cross-machine allowlist-group membership and apply.

## Relevance
`still relevant` — #1127/#1140/#1144 fixed adjacent pieces; the mixed-machine rows and SSH-pairwise limit addressed here are still open.

## Evidence
The one capture (`auto: matched src/ui-app/**`, route `/`) is desktop Mission Control; it cannot render the changed mobile Hub, so the screen's project list and "Couldn't check these machines" group are visually unverified. No console errors, no blank shot, no visual defect shown.

## Bugs
- **Class: shared result shape contract** — `src/server/routes/servers.ts:171-180` now returns only `projectName`/`port`/`valid`/`url`, but `buildAllowlistGroupState` (`src/server/routes/budget-allowlist-groups.ts:136-145`) feeds those rows to `groupMembersFromServers` (`src/core/allowlist-group-sync.ts:55-70`), which requires `allowlistGroup`. Every peer answering over HTTP is silently dropped from the group's member list, so a pause/apply reports success while other machines never receive it. The same rows lack `root`, which `propagateAllowlistGroup` passes to `groupApplyCommand`'s `cd` (`allowlist-group-sync.ts:188`), so the remote write would run in `$HOME`. This is a regression from the pass-4 tree, which sent both fields (`git diff d6f3f8d51 HEAD -- src/server/routes/servers.ts`); the fields are not credentials. Either restore them in the listener payload or resolve members/root over SSH for HTTP-discovered hosts.
No further findings of this class were found after grepping: the peer listener payload builders, `budget-allowlist-groups.ts`, `allowlist-group-sync.ts`, `groupMembersFromServers`/`groupApplyCommand` callers, `collectTailnetServers` spread of listener rows, `src/commands/servers.ts`, and the tailnet-route tests.

## Edge cases
- An empty listener payload returns `disabled: true`, so a peer with discovery on but no valid rows is reported as "tailnet discovery is turned off on this machine" — a fabricated failure reason.
- A saved custom-domain server on a downed machine cannot be reconciled (no host alias), so it still appears in the failure group; MagicDNS/name-matched saves work.
- The listener binds only at server start; Tailscale coming up later leaves the machine unprobeable until restart.

## Suggestions (non-blocking)
- Re-capture the mobile Hub discovery screen (fixture `discover` plus a failures fixture) on the final tree; the desktop root shot adds no coverage.
- Distinguish "no RepoOS projects running" from the opt-out `disabled` response.
- Drop the now-unused `originOf` export and fix `docs/mobile-architecture.md`'s claim that the listener returns "shared server row fields".

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T15:11:53.940Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

