---
task: "1153"
pass: 3
at: "2026-11-17T13:02:47.728Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-find-servers-on-my-tailnet-stop-list
state: ok
tree_identity: "6c593167d:"
---
## Verdict
`needs some work` — one process decides `tailnetDiscovery` for every project on the machine, and user docs describe the plain-HTTP probe as HTTPS.

## Relevance
`still relevant` — #1127/#1132/#1140/#1144 covered adjacent pieces; the mixed-machine tailnet symptom this task addresses is still open and unsolved elsewhere.

## Evidence
None

## Bugs
- **Class: config-key enforcement (machine-level listener scope)** — `src/server/tailnet-discovery-listener.ts:19` binds one process's `config` to the shared port 41641, but `tailnetDiscovery` is a per-repo `repoos.toml` key. When a machine runs several projects (bee runs two), whichever process wins the bind decides for all of them: a project with `tailnetDiscovery = false` is still advertised if a sibling owns the port, while a machine whose owner wants discovery can answer `{disabled:true}` if the other process bound first. Bind order is start order / 2 s retry, so the outcome is nondeterministic and neither project's setting is honoured. Gate per registry row (each project's own config) or make the setting explicitly machine-owned and document that.
- **Class: docs/behaviour mismatch (transport)** — `user-docs/android-hub.md:142` and `user-docs/cli.md:642` say peers are probed over a "small HTTPS discovery endpoint"; `defaultHttpDiscovery` (`src/core/tailnet-servers.ts:543`) and the listener are plain `http://` on port 41641 (only WireGuard encrypts it). `docs/mobile-architecture.md:136` and `mobile/README.md` are correct; fix the two user docs so they don't contradict the code.

No further findings of this class were found after grepping: `src/core/tailnet-servers.ts` HTTP/SSH fallback branches, `src/server/routes/servers.ts` gate and handler, `src/server/server.ts` registration/lifecycle and `PUBLIC_PATHS`, `tailnet-discovery-listener.ts`, `config.ts` `tailnetDiscovery`, `api-route-parity.ts`, `mobile/src/{tailnet,reachability,app-state}.ts`, `TailnetDiscoveryView.vue`, `mobile/src/style.css`, all four tailnet test files, `docs/mobile-architecture.md`, `user-docs/{android-hub,cli,configuration}.md`, `mobile/README.md`.

## Edge cases
- Saved reconciliation only runs for unreachable/no-URL rows. A *reachable* project saved under a custom domain or different Serve host still appears selectable (the report's "custom domain resolves to saved" claim is not true of that path), and the `projectName`/name alias can mark a no-URL row "Already saved" with another machine's saved URL.
- The listener binds Tailscale IPv4 only. If MagicDNS returns AAAA first, `fetch` may fail and a healthy dual-stack peer falls back to SSH; userspace-networking mode yields `EADDRNOTAVAIL` and no listener (warn log only).
- Listener starts only when the bind host is exactly `0.0.0.0` (`server.ts:4954`), so an explicit `--host <tailnet-ip>` leaves that machine unprobeable over HTTP.

## Suggestions
- Add a test that exercises `defaultHttpDiscovery` and the listener together (port, path, `discoveryVersion`) — today only the injected seam is covered.
- Refresh the report's "Generated change summary": its line counts/file list predate `6c593167` and omit `api-route-parity.ts`, `user-docs/android-hub.md`, `user-docs/cli.md` and `servers-command.test.ts`.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

