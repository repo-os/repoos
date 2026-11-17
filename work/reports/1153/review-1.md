---
task: "1153"
pass: 1
at: "2026-11-17T11:26:05.357Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-find-servers-on-my-tailnet-stop-list
state: ok
tree_identity: "397d8b877:"
---
## Verdict
`needs some work` — probe only tries port 443, one URL per machine, saved machines still show as unreachable, and the Hub renders a contradictory empty-state hint.

## Relevance
`still relevant` — #1105/#1127/#1140/#1144 solved adjacent pieces; the tailnet-of-mixed-machines symptom is still open and this diff is the right follow-up.

## Evidence
None

## Bugs
- **Class: hard-coded probe origin/port** — `src/core/tailnet-servers.ts:516` probes only `https://<dns>` (implicit 443). RepoOS itself exposes serve on 443/8443/10000 (`src/core/tailscale.ts` `HTTPS_PORTS`), and this repo's own test fixture (`tailnet-servers.test.ts`) puts a peer on `:8443`; those healthy peers never answer, fall back to SSH, and reproduce the unreachable rows. No HTTP candidate either.
- **Class: per-project URL mapping** — `src/server/routes/servers.ts:154` returns one `url: https://${req.headers.host}` for every project on a machine. Projects not on that serve mapping get a wrong URL, and `mobile/src/tailnet.ts` dedupes by origin, so bee's two projects collapse to one row (criterion 1). The URL also comes from the request Host, not the peer's serve/self DNS.
- **Class: shared result shape contract** — the peer payload omits `allowlistGroup`/`root`/`valid` that SSH rows carry. `groupMembersFromServers` (`src/core/allowlist-group-sync.ts:59`) filters on `allowlistGroup`, so HTTPS-discovered peers disappear from allowlist-group propagation in `src/server/routes/budget-allowlist-groups.ts:136` — a regression of a documented feature.
- **Class: saved-state reconciliation** — `mergeTailnetResults` marks saved only by URL origin; unreachable rows have no URL, so a machine hosting a saved server still lands under "Couldn't check these machines" (criterion 3).
- **Class: template conditional chaining** — `TailnetDiscoveryView.vue:134` `v-else-if` chains to `<details>`, not the project list. On the normal success path (`message === ""` when something is selectable) the list renders together with "No RepoOS servers answered from this server's tailnet."
- **Class: fallback handling** — HTTP parsing sits inside the SSH `try` (`tailnet-servers.ts:626-643`); a 200 non-JSON from any service on 443 throws and becomes an "unreachable" row, bypassing the promised SSH fallback for older peers.
- **Class: timeout budget mismatch** — server deadline is now 20s while `mobile/src/tailnet.ts:219` aborts at 15s, so slow passes now show "took too long" and lose all partial results; the 750ms probe budget is also below TLS+serve latency.
- **Class: config-key enforcement** — `getTailnetPeerDiscovery` ignores `config.tailnetDiscovery === false`, so "off" still advertises project names/ports to any tailnet peer.
- **Class: proxy-header trust** — the new handler trusts `X-Forwarded-For` from a loopback socket, the exact pattern `server.ts:4542` and `local-token.ts:76` reject because tunnels forward from loopback; the endpoint is also in `PUBLIC_PREFIXES`, so the tailnet-only gate can be spoofed.

No further findings of this class were found after grepping: `src/core/tailscale.ts` HTTPS ports, `tailnetServerUrl`/`parseTailscaleServeUrls`, `src/commands/servers.ts` JSON rows, `allowlist-group-sync.ts`, `budget-allowlist-groups.ts`, `mergeTailnetResults`/`app-state.ts`, `server.ts` PUBLIC_PREFIXES and local-token gate, the three tailnet test files, `user-docs/*.md`.

## Edge cases
Phone filter reads `HostName` only (never `DNSName`), so a phone with no HostName slips through; `\bphone\b` also excludes a real `phone-01` server. No test covers the "Nothing Phone" name case without `OS: "android"`. A peer returning `servers: []` suppresses SSH fallback. `user-docs/configuration.md:596` still says group membership is applied "over the SSH credentials that discovery already uses".

## Suggestions
Style `.discovery-failures`/`.discovery-failure-row` (no rules in `mobile/src/style.css`). Turn raw SSH stderr into the requested plain fixes ("SSH is off on muse"). Add tests for the phone-name path, saved-vs-unreachable merge, the Hub hint, and the new prospective payload fields.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

