---
task: "1140"
pass: 10
at: "2026-11-16T10:09:59.974Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/bug-make-tailnet-server-discovery-work-a
state: ok
tree_identity: "63dd0721e:"
---
## Verdict
`good to go` — no blocking defects; the fallback, PATH, classification and registry/status contracts hold, and the moved tests collect.

## Relevance
`still relevant` — #1105's tailnet discovery is on main, and the absent-CLI, non-interactive-PATH, mislabelled-SSH-error and unregistered-worktree-serve premises still hold.

## Evidence
None

## Bugs
None found
No further findings of this class were found after grepping: `collectTailnetServers`/`tailnetFallbackNotice`/`cmdServers` JSON+text branches, `remoteShellCommand`/`serversSshArgs` and both `remoteExec` callers, `classifyGroupApplyFailure`, all `previewOverrides`/`previewOverridesRequested` predicates (`server.ts`, `schedule-automation.ts`, `server-registry.ts`, `serve.ts`), serve-lock readers (`status`, `server-restart`, `server-locate`, `doctor`), registry validation/pruning, Hub/mobile payload consumers, and every new/changed `*.test.ts` path against the vitest `include`.

## Edge cases
- `status` reconciles on the probe port but keeps the primary lock's `pid`/`host`/`startedAt`; with a test-only `probePort` different from the lock this mixes endpoints. Production derives the probe port from the lock.
- An unparseable `tailscale status --json` is reported as `tailscaleUnavailable` and falls back, same as a missing CLI (documented as "absent or unreadable").
- `serverRegistrationState` accepts a same-root/same-port entry without checking its PID when the lock's PID is not provably alive, so a stale entry can read `registered` while `servers` marks it stale.
- Any child `signal`/`killed` reads as a timeout; only execFile's timeout/maxBuffer kills here, and maxBuffer is carved out.
- The shell test requires `bash`; true on macOS/Ubuntu but not on a minimal Alpine image.

## Suggestions
- Remove the duplicated assertion in `mobile-tailnet-discovery.test.ts` (~line 165): the same `toMatch` appears twice.
- The `src/core/temp-dir.ts` + `ui-smoke`/`ui-contrast-audit` changes are outside the task's stated scope. They are small and tested, but belong in their own task next time.
- `remoteShellScript`'s "command is a trusted internal constant" comment is not strictly true for the allowlist path (it interpolates a quoted repo path); the quoting is safe, but the comment should say so.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

