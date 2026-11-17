---
task: "1144"
pass: 2
at: "2026-11-17T03:05:05.608Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/fix-tailnet-server-discovery-using-magic
state: ok
tree_identity: "d6df15aaf:"
---
## Verdict
`good to go` — MagicDNS identity, mobile filtering, URL mapping and deterministic fakes all hold; only the task file conflicts with main, which close-out owns.

## Relevance
`still relevant` — `main`'s parser still prefers `HostName` (checked `git show main:src/core/tailnet-servers.ts`), and no landed task supersedes this premise.

## Evidence
None — `shots: skipped` is correct for a code/docs diff; no UI capture applies.

## Bugs
None found

No further findings of this class were found after grepping: `parseTailnetInfo`/`parseTailnetPeers` callers (`src/commands/servers.ts`, `src/server/routes/servers.ts`), the `tailscaleUnavailable` configured-hosts branch, `configuredByHost` lookups, `tailnetServerUrl`, `displayName` consumers (`mobile/src/tailnet.ts`, `TailnetDiscoveryView.vue`, `app-state.ts`), CLI printers, the four docs files and the three test files.

## Edge cases
- **Dedup key asymmetry:** identity is full `DNSName` but falls back to the short label. A DNSName-less duplicate of a peer (or a `Self` entry without `DNSName`) no longer collapses/is excluded as the old short-host key did, so it would be probed twice or self-probed. Low likelihood, but it is the one place the old collapse guarantee weakened.
- **Silent drop:** a server-capable peer with no valid `DNSName` and a non-DNS-safe `HostName` (MagicDNS disabled) disappears with no row or reason, instead of the old "invalid hostname" error. Worth a deliberate note in docs.
- **Configured per-host matching:** lookup tries `peer.host` and full `peer.dnsName`, not `displayName` and not case-normalized keys. A `[[remoteValidation.tailscaleHosts]]` row pinned to the old display-name host silently loses its `user`/`os` settings.
- **Filter placement vs docs:** the mobile filter runs in `parseTailnetInfo`, before config matching, so with Tailscale available a configured host that is also an online mobile peer is never probed. The docs/report phrase "explicitly configured hosts are still probed" is only true for the CLI-unavailable fallback; reword to say so.

## Could not verify (environment)
Landing checklist "Main clean: FAIL" is the pre-existing uncommitted `repoos.toml`; the own-task-file merge WARN is resolved from main at close-out. Neither is a code defect, so I did not rerun landing commands.

## Suggestions
- Strip control characters from `displayName` before the CLI prints it (it is peer-controlled text; terminal escape injection).
- Make the configured-hosts sentence in `docs/server-registry.md` and `user-docs/cli.md` explicitly describe the Tailscale-unavailable fallback only.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

