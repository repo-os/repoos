---
task: "1284"
pass: 3
at: "2026-11-22T12:58:52.037Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/mac-hub-local-server-will-not-start-env-
state: ok
tree_identity: "e7e239323:"
---
## Verdict
needs some work — Finder launches still miss RepoOS/runtime locations supported by the project’s launcher.

## Relevance
still relevant — the base still has the PATH-dependent Hub launch path this task fixes.

## Evidence
None

## Bugs
- **Class: Runtime discovery coverage** — `LocalRepoOSLaunchPlanner` searches only its hard-coded directories and inherited PATH. From Finder, an npm-installed `repoos` under `~/.nvm/versions/node/.../bin` is reported as not installed; when `repoos` is found but Node or Bun is only in nvm/mise locations, it is reported missing. The project’s standalone launcher already probes nvm defaults, mise shims, and bundled Bun, so those setups still cannot start from the Hub.
No further findings of this class were found after grepping: `LocalRepoOSServiceController.swift` and both planner fallbacks, `src/core/launcher-runtime.ts`, `src/core/runtime.ts`, `docs/install-layout.md`, `user-docs/troubleshooting.md`, the macOS docs and planner tests, and the Hub service-action callers.

## Edge cases
The engineering report’s source commit matches the reviewed implementation; later commits add task/report bookkeeping. Signed Finder launch and real-app remove/re-add remain unverified; the scripted regression is present. The server preflight reports only the task’s own work file conflicts with main, which close-out resolves.

## Suggestions
Create a dedicated human-verification task for a signed Finder launch and real-app remove/re-add, as the spec requires.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

