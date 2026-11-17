---
task: "1153"
pass: 2
at: "2026-11-17T11:52:18.492Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-find-servers-on-my-tailnet-stop-list
state: ok
tree_identity: "d0b9f8ade:"
---
## Verdict
`needs some work` — the new unauthenticated discovery endpoint is not actually tailnet-only, and Serve path URLs are still lost.

## Relevance
`still relevant` — #1127/#1132/#1140/#1144 solved adjacent pieces; the mixed-machine tailnet symptom is still open.

## Evidence
None (no declared shots; the task's UI change has no capture, which is not blocking here).

## Bugs
- **Class: tailnet-only access gate** — `src/server/routes/servers.ts:126-148`: `/api/servers/discovery` is in `PUBLIC_PATHS`, and for a loopback socket the only check is a client-supplied `Tailscale-User-Login` header. A tunnel or any local process reaching the port from 127.0.0.1 can set that header and read project names, ports and `root` paths from the internet — the exact loopback-tunnel case `server.ts:4537-4545` rejects for the local-token path via forwarding-header checks, which this gate omits. The reverse also fails: a peer arriving through Serve without a user identity (tagged nodes) is rejected and falls back to SSH, which is the bug this task fixes.
- **Class: per-project URL mapping** — `mobile/src/tailnet.ts:180,200`: `displayOrigin` reduces every URL to `url.origin`, discarding the Serve path suffix the new endpoint now returns (`parseTailscaleServeUrls` yields `https://bee/repoos`). The row saves `https://bee` (404) and `byOrigin` collapses two projects on one origin into a single row, so criterion 1 (“every running project”) fails for path-mapped Serve. Same class as pass 1's fixed port-mapping finding.

No further findings of this class were found after grepping: `src/core/tailscale.ts` ports, `parseTailscaleServeUrls`/`tailnetServerUrl`, `src/commands/servers.ts`, `allowlist-group-sync.ts`, `budget-allowlist-groups.ts`, `mergeTailnetResults`/`app-state.ts`, `server.ts` PUBLIC_PATHS/local-token gate, `tailnet-servers.test.ts`, `servers-command.test.ts`, `mobile-tailnet-discovery.test.ts`, `mobile-server-list.test.ts`, `user-docs/*.md`.

## Edge cases
- A peer answering `disabled: true` returns `[]` (`tailnet-servers.ts:683`), so it vanishes from both lists instead of appearing in the collapsed group with a reason.
- Engineering report is stale (source `df3bbdc` ≠ HEAD `d0b9f8a`); its change summary omits `mobile/src/style.css`, the new tests and `docs/mobile-architecture.md`, and no current-round report exists.
- Saved-host reconciliation matches only the saved URL's first DNS label; a saved custom-domain server on a peer still shows as unreachable, and two saved servers on one host collapse to one row.
- With only failed machines, `app-state.ts` still shows “Every server found is already saved or can't be added yet.”

## Suggestions
- Add tests for `getTailnetPeerDiscovery` (gate, disabled payload, serve-URL mapping) and for the collapsed group rendering — none exist.
- `defaultHttpDiscovery` fires `http://<host>:443/8443/10000`, which can never be a RepoOS port; drop it or probe project ports.
- Turn raw SSH diagnostics into the requested plain fixes (“SSH is off on muse”, “no key from thinkpad”).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

