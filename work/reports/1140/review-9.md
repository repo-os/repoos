---
task: "1140"
pass: 9
at: "2026-11-16T08:36:32.031Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/bug-make-tailnet-server-discovery-work-a
state: ok
tree_identity: "913d99b3d:"
---
## Verdict
`needs some work` — the tests for PATH/shell construction, the `configured-hosts` fallback and the `ConnectTimeout=4` regression live outside the vitest include and never run.

## Relevance
`still relevant` — #1105's discovery is on main and the non-interactive PATH, mislabelled SSH error and unregistered hand-run serve premises still hold.

## Evidence
None

## Bugs
- **Class: test registration (tests outside the vitest include)** — `src/ui-app/vite.config.ts:91` is the only test config and includes `tests/**/*.test.ts` under `src/ui-app`; the new tests in `src/commands/servers.test.ts` (+265 lines), `src/core/server-registry.test.ts` and `src/server/__tests__/tailnet-servers.test.ts` therefore never execute. Verified: `bun run test -- --failed-first src/commands/servers.test.ts` answers "No test files found". So acceptance criteria 1–3 (absent-CLI `configured-hosts` fallback, `sh -c` PATH under sh/bash/zsh, `ConnectTimeout=4` command-not-found vs real timeout) and review‑5's "assert the fallback line through `cmdServers`" have no gate-enforced test; only the engineer's direct run covers them. The repo documents this trap in `src/ui-app/tests/keyword-rank.test.ts:5` and `review-verification-narrow.test.ts:2` — move or duplicate these cases into `src/ui-app/tests/`. Instances: all three files above; criteria 4 and the Hub wording are correctly covered in `server-registry-serve.test.ts`, `status-command.test.ts`, `mobile-tailnet-discovery.test.ts`.

No further findings of this class were found after grepping: all new/changed `*.test.ts` paths in the diff, `scripts/run-tests.mjs`, `scripts/select-test-files.mjs`, `src/ui-app/vite.config.ts` include/setup, and the existing ui-app duplicates (`keyword-rank`, `review-verification-narrow`, `server-registry-serve`, `status-command`).

## Edge cases
- The displayed report is round 2 (source commit `38a2142`); HEAD's code tree (`913d99b3d`) contains the round‑2 review fixes with no round‑3 report, so its rationale was not used as evidence.
- That report says the check plan used `REPOOS_SKIP_TESTS=1`, so suite evidence rests on the engineer's direct run.
- `status` reconciles registration on `probePort` but still prints `server.port` from a stale primary lock when they differ.
- `configured-hosts` also covers unparseable `tailscale status --json`, not only a missing CLI (docs say "absent or unreadable").
- Registry matching skips the PID check when the lock's PID isn't provably alive, so an entry from another process on the same port/root could read as `registered`.

## Suggestions
- Add a running ui-app test asserting `discoverySource: "configured-hosts"` and the text fallback line, so the label has gate coverage rather than only direct-run coverage.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

