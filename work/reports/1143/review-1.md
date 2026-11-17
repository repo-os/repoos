---
task: "1143"
pass: 1
at: "2026-11-17T10:59:04.547Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/test-easter-eggs-1026-e2-resolveservehos
state: ok
tree_identity: "af74ef270:"
---
## Verdict
`good to go` — test-only fix; I ran the file on this Tailscale-enabled host: 8/8 pass, no production code touched.

## Relevance
`still relevant` — main's E2 still asserts `resolveServeHost(undefined).host === "127.0.0.1"`, and this machine really returns `100.106.252.73` from `detectTailscaleIPv4`, so the flake is live.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `resolveServeHost`/`detectTailscaleIPv4` callers (`src/commands/serve.ts:249`, `src/core/tailscale.ts:8`), sibling tests (`serve-title.test.ts`, `tailscale-https.test.ts` — injects `exec`, host-independent), and the `vi.mock` registrations in `src/ui-app/tests`.

## Edge cases
- Stubbing is genuinely per-case: the detected assertion uses `toEqual` with `tailscaleIP`, so it can only pass if `vi.mocked(detectTailscaleIPv4)` is the same stub `serve.ts` sees (it does — the run passes with detection forced to `100.64.0.7`).
- The file-level mock spreads `importOriginal`, so `ensureTailscaleHttps` (also imported by `serve.ts`) stays real; only this one export is replaced.
- No other test in the file calls `detectTailscaleIPv4`, so the shared `vi.fn(() => null)` default can't mask another case; mock state is set inside E2 in order-independent fashion.
- The landing checklist's "not landable / 1 fail" is the absent review verdict, not a code or merge problem; the only merge conflict is this task's own file, which close-out resolves from main.
- Local `REPOOS_SKIP_TESTS=1` means the remote full-suite run remains authoritative; my isolated run covers the changed file.

## Suggestions
- `src/ui-app/tests/easter-eggs-1026.test.ts:66` repeats the pre-existing `resolveServeHost("0.0.0.0").tailscaleDetected` assertion already made at line 58 (old line kept next to the new ones). Harmless, but drop the duplicate so the three cases read cleanly.
- Optional: reset the stub in `afterEach` (`detect.mockReset()` or restore the `() => null` default) if E2 ever grows more cases that share the module mock.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

