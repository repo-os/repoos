---
task: "1140"
pass: 4
at: "2026-11-16T05:26:23.382Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/bug-make-tailnet-server-discovery-work-a
state: ok
tree_identity: "0bfc198b2:"
---
## Verdict
`needs some work` — two real defects in the new SSH-failure classification and the fallback label; the PATH and registry work itself is sound.

## Relevance
`still relevant` — #1105 shipped tailnet discovery and the reported failures (missing CLI, non-interactive PATH, mislabelled SSH errors, unregistered hand-run serve) still hold on main.

## Evidence
None

## Bugs

- **Class: SSH cause classification (remote stderr treated as transport cause)** — `src/core/tailnet-servers.ts:291` matches any `permission denied` in `stderr`, but SSH forwards the remote command's own stderr, so a non-executable launcher (`sh: 1: repoos: Permission denied`) or remote `EACCES: permission denied, open ~/.repoos/servers/…` is reported as `SSH authentication failed: …` (reproduced with `bun -e`). That contradicts "retain their actual cause" and sends the user to SSH keys. Match SSH's own shape (`Permission denied (publickey|password|…)`, exit 255) and add a regression test. Instances: the cause regexes at :291–:305 all run against `stderr || message`, i.e. also remote program output; sibling path `classifyGroupApplyFailure` (`src/core/allowlist-group-sync.ts:141`) still matches `timeout` on the raw message and returns `error.message` (:228), so a command-not-found there surfaces as `unreachable` plus the whole `ssh … ConnectTimeout=4 …` argv.
- **Class: fallback labelling (fallback source claimed when none exists)** — `src/core/tailnet-servers.ts:521` sets `source: "configured-hosts"` whenever the Tailscale CLI is missing, even with an empty configured pool; `mobile/src/tailnet.ts:263` then tells the user "it listed servers from its configured hosts instead" when only local rows were listed, and `docs/server-registry.md:94` / `user-docs/cli.md:635` define that value as "the pool supplied the peers". The default macOS setup (Tailscale app, no CLI, no `tailscaleHosts`) hits this. Add a distinct source (`none`/`local-only`) or gate the message on a non-empty pool.

No further findings of this class were found after grepping: registry consumers (`server-locate.ts`, `server-restart.ts`, `global-engineers.ts`, `routes/servers.ts`, `routes/budget-allowlist-groups.ts`), both `remoteExec` implementations, other lock readers (`core/doctor.ts`), Hub/mobile payload consumers, and docs/test registrations.

## Edge cases
- Dropping the worktree exclusion supersedes #0845's "task worktree servers never register": worktree serves now appear in Hub's local list, global engineer counts and allowlist-group members. Intended, but only unit tests cover `--preview-overrides` exclusion on a real port.
- `registration` reconciles against the `primary` lock's port/pid; a stale lock while health answers on `opts.probePort` can report `unregistered` for a healthy server.
- `shouldRegisterServerRegistry` is now unused outside tests (dead export).

## Suggestions
- Test the human-readable `repoos servers` fallback line; only `--json`/`source` is asserted.
- Extract the duplicated `defaultRemoteExec` in `routes/budget-allowlist-groups.ts` to share the core one.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

