---
task: "1140"
pass: 5
at: "2026-11-16T07:34:50.551Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/bug-make-tailnet-server-discovery-work-a
state: ok
tree_identity: "38a214299:"
---
## Verdict
`needs some work` — `--preview-overrides` exclusion ignores the flag, and Hub's old-server message asserts local-only; the PATH/classification/registry fixes otherwise hold.

## Relevance
`still relevant` — #1105's tailnet discovery is on main and the reported non-interactive-PATH, mislabelled-SSH-error and unregistered-hand-run-serve premises still hold.

## Evidence
None

## Bugs
- **Class: registry exclusion policy** — `src/core/server-registry.ts:97` excludes only when `config.previewOverrides.length > 0`, but `loadConfig` sets that list only for overlay keys it actually applied (`src/core/config.ts:1477`). `repoos serve --preview-overrides` in a repo with no overridable `[preview.*]` keys passes `opts.previewOverrides === true` yet gets `registryExclusion === null` (`src/server/server.ts:1281`) and registers, contradicting `user-docs/cli.md` ("`--preview-overrides` … never register") and `docs/server-registry.md`; status then reports `registered` for a documented-excluded server. `server.ts:1261` already computes the correct predicate (`opts.previewOverrides === true || …`) for `shouldTuneRepoForScaleAtStartup`; pass that same flag into the exclusion decision. The new real-port test writes `[preview.auth]`, so it exercises the key list, never the flag alone. Sibling instance of the same predicate-only check: `src/server/schedule-automation.ts:23`.
- **Class: fallback labelling** — `mobile/src/tailnet.ts:269` assumes an older server that omits `discoverySource` "can only list its own local servers". Pre-branch servers did fall back to `remoteValidation.tailscaleHosts` and returned remote rows, so the sentence can be false while those rows render; the comment directly above concedes the source is unknowable. Use neutral wording ("used its configured hosts or listed local servers only") and cover it.

No further findings of this class were found after grepping: `tailnetFallbackNotice`, `buildTailnetDiscoveryPayload`, `cmdServers` JSON/text branches, `TailnetCollection.source`, Hub payload consumers, all `previewOverrides` predicates (`server.ts`, `schedule-automation.ts`, `server-registry.ts`), serve-lock intent/reconciliation, and the docs/tests naming each.

## Edge cases
- Displayed report is round 1 (stale); `work/reports/1140/round-2.json` now records sourceSha `38a2142`, matching the reviewed tree. Round-1 claims were not used as evidence.
- `isRemoteTimeout` treats any `signal`/`killed` as a timeout, so an execFile `maxBuffer` kill (2 MB) would read as "timed out".
- Status reconciles at `probePort`; a stale lock's pid/port paired with a healthy server on another port can report `unregistered`.
- Remote PATH covers five install dirs only; a launcher elsewhere now fails clearly rather than silently.
- Worktree serves now appear in Hub's local list and global engineer counts — intended and documented, but a behaviour change from #0845.
- "Tailscale CLI unavailable" is also shown when `tailscale status --json` was merely unparseable.

## Suggestions
- Assert the human-readable `repoos servers --tailscale` fallback line through `cmdServers`, not only `tailnetFallbackNotice`.
- Reuse the exported `shellQuote` instead of the duplicate in `allowlist-group-sync.ts`.

## Could not verify (environment)
- Landing checklist `Main clean: FAIL` is user state (uncommitted `repoos.toml` plus two `.codex-attachments` images), not this diff; review lock is simply not yet recorded.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

