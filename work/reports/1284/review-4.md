---
task: "1284"
pass: 4
at: "2026-11-22T13:17:10.557Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/mac-hub-local-server-will-not-start-env-
state: ok
tree_identity: "bfe16e85d:"
---
## Verdict
needs some work — runtime selection can ignore an explicit Bun path or choose unsupported Node.

## Relevance
still relevant — main still uses the PATH-dependent launcher that causes the Finder/Dock failure.

## Evidence
None

## Bugs
- **Class: Runtime pin fallback** — `LocalRepoOSServiceController.swift`: when `REPOOS_BUN_PATH` is set but unusable, the planner silently tries other Bun locations. This contradicts the documented fallback to Node in `user-docs/environment-and-secrets.md`; the explicit-path test covers only a valid path.
- **Class: Node runtime compatibility** — `LocalRepoOSServiceController.swift`: any executable Node candidate is accepted, even below the documented/package minimum of Node 20.6. With Bun unavailable, an older Node is launched instead of reporting that a supported runtime is needed.
No further findings of this class were found after grepping: `LocalRepoOSServiceController.swift`, its runtime-selection fallbacks, `HubAppState.swift` callers, `package.json`, `src/core/launcher-runtime.ts`, `user-docs/environment-and-secrets.md`, `user-docs/troubleshooting.md`, macOS Hub docs, and planner tests; no new bare `node`, `npm`, or `npx` invocations were found.

## Edge cases
Earlier review findings appear fixed. The round-3 engineering report is stale, but round 4’s source commit matches the reviewed implementation. Signed Finder launch and real-app remove/re-add remain unverified; server preflight reports only the task’s own work-file conflict, handled at close-out.

## Suggestions
Create the separate human-verification task for the signed Finder launch and real-app remove/re-add, including crash-log collection.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

