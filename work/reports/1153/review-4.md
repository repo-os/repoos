---
task: "1153"
pass: 4
at: "2026-11-17T14:00:16.171Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/hub-find-servers-on-my-tailnet-stop-list
state: ok
tree_identity: "d6f3f8d51:"
---
## Verdict
`needs some work` — the live `tailnetDiscovery` opt-out is stale in the registry, a sibling endpoint still exposes opted-out projects, and the branch conflicts with main.

## Relevance
`still relevant` — #1143 only fixed the failing E2 test; #1105/#1127/#1140/#1144 covered adjacent pieces, and the mixed-machine tailnet symptom is still open.

## Evidence
None

## Bugs
- **Class: merge conflict (main drift)** — `src/ui-app/tests/easter-eggs-1026.test.ts` conflicts with main: task #1143 landed a `vi.mock(detectTailscaleIPv4)` fix for the same E2 test, while this branch edited E2 with the new detector seam. Server preflight says merge FAIL. Sync and keep both sides; if main's test wins, the new `detectTailscale` parameter in `src/commands/serve.ts` has no caller.
- **Class: config-key enforcement (per-project `tailnetDiscovery`)** — (a) `src/core/server-registry.ts:483` writes the opt-out only at startup, and `refreshRunningServerIdentity` (called from `src/server/server.ts:1654` on config reload) ignores it; the key is tier `live`, so turning discovery off/on in Settings does not change what the machine listener advertises until restart, contradicting "Set false to hide this project" (`user-docs/configuration.md:479`). (b) `src/server/routes/servers.ts:81-98` builds `localRows` from every validated registry row without filtering `entry.tailnetDiscovery !== false`, so when the phone asks an enabled sibling project on the same machine, an opted-out project is still returned — the listener filters it, the authenticated path does not.
- **Class: docs/behaviour mismatch** — `user-docs/cli.md:644-646` and `docs/mobile-architecture.md:155-157` still claim failures read `SSH authentication failed` / `connection refused`, but `collectTailnetServers` now runs `tailnetPeerFailureReason` for every caller, printing "no SSH key from X" / "SSH is off on X". `src/core/config.ts:3987-3991` still describes the setting as "Tailscale CLI + SSH" and "refuse the request", omitting HTTP discovery and per-project hiding; `docs/mobile-architecture.md:135` says the listener binds the Tailscale IPv4 address only (it binds IPv6 too).

No further findings of this class were found after grepping: `src/core/tailnet-servers.ts` HTTP/SSH branches and reason mapping, `src/server/routes/servers.ts` gate/handler/local rows, `src/server/tailnet-discovery-listener.ts` bind/retry/teardown, `src/server/server.ts` registration and close, `src/core/server-registry.ts` register/refresh, `mobile/src/{tailnet,reachability,app-state}.ts`, `TailnetDiscoveryView.vue`, all tailnet tests, `src/core/config.ts` schema, `docs/`, `user-docs/`, `mobile/README.md`.

## Edge cases
- Reachable rows are marked saved when exactly one saved server shares the project name; two machines both running "work" therefore hide the second as "Already saved".
- A saved custom-domain server on an unreachable machine still appears under "Couldn't check these machines" (criterion 3 is only met for MagicDNS-named saved URLs).
- The 3 s HTTP probe budget races the listener's two per-request `tailscale` calls (2 s each); a slow CLI turns a healthy peer into an SSH fallback failure.
- Tailscale started or renumbered after server start leaves no listener until restart (userspace networking logs a warning only).
- `disabled: true` is never emitted by the new handler, so `collectTailnetServers`' disabled branch and its test are production-dead.
- Round-4 report's "Generated change summary" lists 15 files; the reviewed diff has 32.

## Suggestions
- Add a test that actually binds `startTailnetDiscoveryListener` and probes it, covering bind failure/retry and teardown.
- Either keep the `resolveServeHost` detector seam with its own test or drop it after merging main's test.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

