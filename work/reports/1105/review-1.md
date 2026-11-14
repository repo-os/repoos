---
task: "1105"
pass: 1
at: "2026-11-14T03:40:23.944Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/repoos-servers-tailscale-list-repoos-ser
state: ok
tree_identity: "d1342d810:"
---
## Verdict
`needs some work` — remote SSH probes ignore per-host `user` from `remoteValidation`, so configured hosts like `peckjachowski@mini` often show as unreachable.

## Relevance
`still relevant` — fills a real gap in cross-machine server visibility and matches how remote validation already thinks about the tailnet.

## Evidence
None

## Bugs
- **Class: remote SSH identity mismatch** — `src/commands/servers.ts` `defaultRemoteExec` passes a bare Tailscale short name to `ssh` (no `user@host`). `cmdServers` feeds `collectTailnetServers` only `resolveRemoteHosts(...).map((host) => host.host)`, discarding per-host and global users that `remoteHostUser` supplies everywhere else (`runner-engineer-clis.ts`, `bundle-upload.ts`, `remote-validation.ts`). Fallback and Tailscale paths share the same broken SSH target shape; tests inject `remoteExec` and never assert SSH argv.

No further findings of this class were found after grepping: `src/commands/servers.ts`, `src/commands/servers.test.ts`, `src/core/remote-hosts.ts`, `src/core/runner-engineer-clis.ts`, `src/server/bundle-upload.ts`, `src/server/remote-validation.ts`, `user-docs/cli.md`.

## Edge cases
Tailscale-online peers with zero registered servers emit no row (only failures get `unreachable`). A successful `tailscale status` with unparseable JSON is reported as “CLI unavailable” and triggers host-pool fallback.

## Suggestions
Resolve SSH targets via the host pool (`remoteHostUser`) for both Tailscale peers and configured fallback; add a unit test with non-default users. Optional DRY: peer parsing overlaps `src/core/tailscale.ts` status JSON handling. Landing checklist: main has uncommitted `repoos.toml` (environmental, not this branch).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

